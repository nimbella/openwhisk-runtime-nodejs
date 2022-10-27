#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

# build go proxy from source
ARG GO_PROXY_BASE_IMAGE=golang:1.18
FROM $GO_PROXY_BASE_IMAGE AS builder_source
ARG GO_PROXY_GITHUB_USER=nimbella-corp
ARG GO_PROXY_GITHUB_BRANCH=dev
RUN git clone --branch ${GO_PROXY_GITHUB_BRANCH} \
    https://github.com/${GO_PROXY_GITHUB_USER}/openwhisk-runtime-go /src ;\
    cd /src ; env GO111MODULE=on CGO_ENABLED=0 go build main/proxy.go && \
    mv proxy /bin/proxy

# or build it from a release
FROM $GO_PROXY_BASE_IMAGE AS builder_release
ARG GO_PROXY_RELEASE_VERSION=1.15@1.17.0
RUN curl -sL \
    https://github.com/apache/openwhisk-runtime-go/archive/{$GO_PROXY_RELEASE_VERSION}.tar.gz\
    | tar xzf -\
    && cd openwhisk-runtime-go-*/main\
    && GO111MODULE=on go build -o /bin/proxy

FROM node:14-stretch

# select the builder to use
ARG GO_PROXY_BUILD_FROM=source

# Initial update and some basics.
#
RUN apt-get update && apt-get install -y \
    imagemagick \
    graphicsmagick \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Add sources and copy the package.json to root container,
# so npm packages from user functions take precendence.
#
WORKDIR /nodejsAction
ADD  . /nodejsAction/
COPY package.json /

# Customize runtime with additional packages.
# Install package globally so user packages can override.
#
RUN cd / && npm install --no-package-lock --production \
    && npm cache clean --force

# move nim sdk to node modules directory so that it can be found by node module loader
RUN mkdir /node_modules/nim && mv /nodejsAction/nim.js /node_modules/nim/index.js

# install doctl serverless (co-exist with nim temporarily)
ARG DOCTL_DOWNLOAD=https://no-default.com
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -L ${DOCTL_DOWNLOAD} | tar xzf - && mv doctl /usr/local/bin/doctl && doctl sls install

ARG __OW_LAMBDA_COMPAT
ENV __OW_LAMBDA_COMPAT=$__OW_LAMBDA_COMPAT

COPY --from=builder_source /bin/proxy /bin/proxy_source
COPY --from=builder_release /bin/proxy /bin/proxy_release
RUN mv /bin/proxy_${GO_PROXY_BUILD_FROM} /bin/proxy

ADD bin/compile /bin/compile
ENV OW_COMPILER=/bin/compile

# log initialization errors
ENV OW_LOG_INIT_ERROR=1
# the launcher must wait for an ack
ENV OW_WAIT_FOR_ACK=1

ENV OW_INIT_IN_ACTIONLOOP=/nodejsAction/prelauncher.js

ENTRYPOINT [ "/bin/proxy" ]
