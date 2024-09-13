FROM oven/bun:canary

WORKDIR ./

RUN ls

RUN apt-get update && apt-get install unzip

RUN bun upgrade

RUN bun i

CMD bun run start