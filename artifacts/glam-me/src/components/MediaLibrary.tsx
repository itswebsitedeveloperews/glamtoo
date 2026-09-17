import { useState, useRef, ChangeEvent } from "react";
import { Image as ImageIcon, Upload, X } from "lucide-react";
import { getCatalogMediaSource } from "@/data/catalog";

type MediaLibraryProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (images: string[]) => void;
  multiple?: boolean;
  availableImages: string[];
  onUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
  isUploading?: boolean;
};

export function MediaLibrary({
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  availableImages,
  onUpload,
  isUploading,
}: MediaLibraryProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function toggleSelection(image: string) {
    const next = new Set(multiple ? selected : []);
    if (next.has(image)) {
      next.delete(image);
    } else {
      next.add(image);
    }
    setSelected(next);
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-media-library" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="media-library-title">
        <header className="admin-modal-header">
          <h2 id="media-library-title">Select Image</h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </header>
        <div className="admin-media-library-content">
          <div className="admin-media-library-grid">
            <div className="admin-media-library-upload-card" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}>
              <Upload aria-hidden="true" />
              <span>Upload new</span>
              <input ref={fileInputRef} type="file" multiple={multiple} accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onUpload} disabled={isUploading} />
            </div>
            {availableImages.map((image, i) => {
              const isSelected = selected.has(image);
              const preview = getCatalogMediaSource(image);
              return (
                <button
                  key={`${image}-${i}`}
                  className={`admin-media-library-item ${isSelected ? "is-selected" : ""}`}
                  type="button"
                  onClick={() => toggleSelection(image)}
                >
                  {preview ? <img src={preview} alt="" /> : <div className="admin-image-placeholder"><ImageIcon aria-hidden="true" /></div>}
                  {isSelected && <div className="admin-media-library-item-check"><span aria-hidden="true">✓</span></div>}
                </button>
              );
            })}
            {availableImages.length === 0 && (
              <div className="admin-media-library-empty">No images found.</div>
            )}
          </div>
        </div>
        <footer className="admin-modal-footer">
          <span className="admin-media-library-count">{selected.size} selected</span>
          <div className="admin-modal-actions">
            <button type="button" className="admin-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="admin-primary" disabled={selected.size === 0 || isUploading} onClick={() => { onSelect(Array.from(selected)); onClose(); }}>
              {isUploading ? "Uploading..." : "Select"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
