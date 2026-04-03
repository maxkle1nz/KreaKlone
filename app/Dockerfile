FROM node:22-alpine
WORKDIR /workspace
COPY package.json ./package.json
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
EXPOSE 3000
CMD ["npm", "run", "dev"]
