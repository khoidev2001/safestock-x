/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly RENDERER_VITE_ADMIN_EMAIL?: string;
  readonly RENDERER_VITE_ADMIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
