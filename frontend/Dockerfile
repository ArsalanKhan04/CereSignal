FROM node:26-alpine AS builder

ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

WORKDIR /app

# The Node major tracks /.nvmrc, which sits outside this build context. npm is pinned
# separately because the npm bundled with Node is not the one lockfiles are written with.
RUN npm install -g npm@12

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine

RUN npm install -g serve@14.2.6

WORKDIR /app

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD serve -s build -l tcp://0.0.0.0:${PORT:-3000}
