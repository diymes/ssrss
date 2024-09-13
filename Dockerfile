FROM oven/bun:canary

WORKDIR /app

COPY index.ts bun.lockb package.json tsconfig.json /app/

RUN apt-get update && apt-get install unzip

RUN bun upgrade

RUN bun i

CMD bun run start