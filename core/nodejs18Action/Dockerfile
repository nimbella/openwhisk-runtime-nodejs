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
FROM $GO_PROXY_BASE_IMAGE AS builder

ARG GO_PROXY_GITHUB_USER=nimbella-corp
ARG GO_PROXY_GITHUB_BRANCH=dev
RUN git clone --branch ${GO_PROXY_GITHUB_BRANCH} https://github.com/${GO_PROXY_GITHUB_USER}/openwhisk-runtime-go /src \
  && cd /src \
  && env GO111MODULE=on CGO_ENABLED=0 go build -o /bin/proxy main/proxy.go

FROM node:18-bullseye-slim

# Initial update and some basics.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    # For npm to work properly.
    git \
    ssh \
    ca-certificates \
    # For the proxy.
    unzip \
    python \
    # Dependencies for the users.
    graphicsmagick \
    imagemagick \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Add sources and copy the package.json to root container,
# so npm packages from user functions take precendence.
WORKDIR /nodejsAction
COPY  . /nodejsAction/
COPY package.json /

# Customize runtime with additional packages.
# Install package globally so user packages can override.
RUN cd / \
  && npm install --no-package-lock --omit=dev \
  && npm cache clean --force

# install the functions-deployer (co-exist with nim temporarily)
ARG DEPLOYER_DOWNLOAD
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -L ${DEPLOYER_DOWNLOAD} | tar xzf - \
  && rm -fr /usr/local/lib/dosls && mv dosls /usr/local/lib \
  && rm -f /usr/local/bin/dosls && ln -s /usr/local/lib/dosls/bootstrap /usr/local/bin/dosls

ARG __OW_LAMBDA_COMPAT
ENV __OW_LAMBDA_COMPAT=$__OW_LAMBDA_COMPAT

COPY bin/compile /bin/compile
ENV OW_COMPILER=/bin/compile

# log initialization errors
ENV OW_LOG_INIT_ERROR=1
# the launcher must wait for an ack
ENV OW_WAIT_FOR_ACK=1

ENV OW_INIT_IN_ACTIONLOOP=/nodejsAction/prelauncher.js

COPY --from=builder /bin/proxy /bin/proxy
ENTRYPOINT [ "/bin/proxy" ]