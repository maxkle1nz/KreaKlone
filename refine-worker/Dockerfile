FROM node:22-alpine
WORKDIR /workspace
COPY package.json ./package.json
COPY packages ./packages
COPY refine-worker ./refine-worker
EXPOSE 4102
CMD ["node", "refine-worker/index.js"]
