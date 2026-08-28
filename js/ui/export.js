/**
 * Getting work out of the browser: SVG, PNG, DXF, a share link, a print sheet
 * and a project file. All of it happens locally — nothing is uploaded, and the
 * share link's payload lives in the URL fragment, which browsers never send.
 */

import { download, toast } from './dom.js';
import { standaloneSvg } from './patterns.js';
import { dxfDocument, dxfFilename, gearEntities, trainEntities } from '../dxf.js';
import { gearOutline, rimRadius } from '../involute.js';
import { shareLink, projectJson, loadProject } from '../state.js';

/**
 * Serialise a live SVG into a standalone file.
 *
 * `var(--token)` resolves against the document; in a downloaded file there is
 * no document, so every token has to be substituted for its computed value
 * first. That is what `standaloneSvg` does — and it is asserted here rather
 * than assumed, because the failure mode is a silently black drawing.
 * See references/pitfalls.md #7.
 */
export function serialiseSvg(source) {
  const { node, width, height } = standaloneSvg(source);
  const text = new XMLSerializer().serializeToString(node);
  if (text.includes('var(--')) {
    throw new Error('Export still contains unresolved CSS custom properties');
  }
  return { text, width, height };
}

export function downloadSvg(source, name) {
  const { text } = serialiseSvg(source);
  download(new Blob([text], { type: 'image/svg+xml' }), `${safeName(name)}.svg`);
  toast('SVG saved');
}

/** Rasterise the same standalone SVG, so the PNG cannot differ from the SVG. */
export async function downloadPng(source, name, scale = 2) {
  const { text, width, height } = serialiseSvg(source);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

  const image = new Image();
  image.decoding = 'sync';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not rasterise the drawing'));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  download(blob, `${safeName(name)}.png`);
  toast('PNG saved');
}

/** One gear, at 1:1 in millimetres, with its reference circles on their own layer. */
export function downloadGearDxf(geometry, { name = 'gear', bore = 0, reference = true, boreProfile = null } = {}) {
  const outline = gearOutline(geometry, { flankSteps: 24, tipSteps: 6, rootSteps: 10 });
  const entities = gearEntities(geometry, outline, {
    bore, reference, boreProfile, rim: geometry.internal ? rimRadius(geometry) : null,
  });
  download(
    new Blob([dxfDocument(entities)], { type: 'application/dxf' }),
    dxfFilename([name, `m${geometry.m}`, `z${geometry.z}`]),
  );
  toast('DXF saved');
}

/** The whole train, at real centres — a drawing you could cut and bolt together. */
export function downloadTrainDxf(model, layout, { phases = null, name = 'gear-train', bore = 0, reference = false } = {}) {
  const entities = trainEntities(model, layout, { phases, bore, reference, steps: 24 });
  if (!entities.length) {
    toast('Nothing to export yet');
    return;
  }
  download(new Blob([dxfDocument(entities)], { type: 'application/dxf' }), dxfFilename([name]));
  toast('DXF saved');
}

/** Copy the share link, falling back to a prompt where the clipboard is blocked. */
export async function copyLink() {
  const link = shareLink();
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copied — it reopens this exact bench');
  } catch {
    window.prompt('Copy this link:', link);
  }
}

export function saveProject(name = 'gear-bench') {
  download(new Blob([projectJson()], { type: 'application/json' }), `${safeName(name)}.json`);
  toast('Project saved');
}

/** Open a project file from disk. Nothing is uploaded; the file is read locally. */
export function openProject(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      loadProject(await file.text());
      toast(`Opened ${file.name}`);
      onDone?.();
    } catch {
      toast('That file could not be read as a Gear Bench project');
    }
  });
  input.click();
}

export const printSheet = () => window.print();

const safeName = (name) => String(name).trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'gear-bench';
