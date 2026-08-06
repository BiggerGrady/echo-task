import path from "path";

/** Prefer DATA_ROOT env (e.g. Fly volume mount at /data). */
export const DATA_ROOT = process.env.DATA_ROOT?.trim() || path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_ROOT, "echo.db");
export const UPLOADS_DIR = path.join(DATA_ROOT, "uploads");
export const OUTPUTS_DIR = path.join(DATA_ROOT, "outputs");
export const REFERENCES_DIR = path.join(DATA_ROOT, "references");
export const SKILLS_DIR = path.join(DATA_ROOT, "skills");
