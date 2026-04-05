import { createComfyUiAdapterServer } from '../packages/deployment/src/comfyui-preview-adapter.js';

const server = await createComfyUiAdapterServer();

if (import.meta.url === `file://${process.argv[1]}`) {
  server.start().then((url) => {
    process.stdout.write(`ComfyUI preview adapter listening on ${url}\n`);
  });
}
