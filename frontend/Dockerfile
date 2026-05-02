FROM node:18-alpine AS builder

ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:18-alpine

RUN npm install -g serve

WORKDIR /app

COPY --from=builder /app/build ./build

EXPOSE 3000

CMD serve -s build -l tcp://0.0.0.0:${PORT:-3000}
