FROM node:22-alpine
WORKDIR /workspace
COPY package.json ./package.json
COPY packages ./packages
COPY upscale-worker ./upscale-worker
EXPOSE 4103
CMD ["node", "upscale-worker/index.js"]
