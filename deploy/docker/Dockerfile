FROM oven/bun:1
WORKDIR /app
COPY package.json ./
COPY bun.lock* ./
RUN bun install
COPY . .
ENV PAGEBOX_DATA_DIR=/data
EXPOSE 3000
CMD ["bun","run","src/entries/bun.ts"]
