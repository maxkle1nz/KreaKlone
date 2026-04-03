FROM node:22-alpine
WORKDIR /workspace
COPY package.json ./package.json
COPY packages ./packages
COPY preview-worker ./preview-worker
EXPOSE 4101
CMD ["node", "preview-worker/index.js"]
