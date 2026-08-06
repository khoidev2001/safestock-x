/// <reference types="vite/client" />

declare module "*.css";

/** Bundler trả về URL của file đã nhúng vào gói build. */
declare module "*.mp3" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly RENDERER_VITE_ADMIN_EMAIL?: string;
  readonly RENDERER_VITE_ADMIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
