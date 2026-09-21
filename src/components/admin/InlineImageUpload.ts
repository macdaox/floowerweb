import type { MediaItem } from "./MediaPicker";
import { uploadAdminImage } from "./media-upload";

export type InlineImageUploadController = {
  choose(): void;
  handleFiles(files: FileList | File[]): Promise<void>;
  destroy(): void;
};

export function createInlineImageUpload(options: {
  onInsert(item: MediaItem): void;
  onStateChange?(uploading: boolean): void;
  onError?(message: string): void;
}): InlineImageUploadController {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/avif";
  input.hidden = true;
  document.body.appendChild(input);
  let destroyed = false;

  const change = () => { if (input.files) void handleFiles(input.files); };
  input.addEventListener("change", change);

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
    if (!file || destroyed) return;
    const altText = window.prompt("请输入图片英文替代文本", file.name.replace(/\.[^.]+$/u, ""))?.trim() ?? "";
    options.onStateChange?.(true);
    try {
      const item = await uploadAdminImage(file, altText);
      if (!destroyed) options.onInsert(item);
    } catch (error) {
      if (!destroyed) options.onError?.(error instanceof Error ? error.message : "图片上传失败，请重试。");
    } finally {
      if (!destroyed) options.onStateChange?.(false);
      input.value = "";
    }
  }

  return {
    choose: () => input.click(),
    handleFiles,
    destroy: () => {
      destroyed = true;
      input.removeEventListener("change", change);
      input.remove();
    },
  };
}
