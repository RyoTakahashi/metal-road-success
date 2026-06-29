#!/usr/bin/env node
// Local MCP server exposing a `generate_image` tool backed by Google Gemini
// image models (Nano Banana / Nano Banana 2). Runs over stdio so Claude Code
// can call it. Keeps everything in-repo — no third-party MCP to trust.
//
// Env:
//   GEMINI_API_KEY  (required)  — Google AI Studio API key
//   IMAGE_MODEL     (optional)  — model id, default "gemini-3-pro-image-preview"
//                                 (Nano Banana 2 / Gemini 3 Pro Image). If that
//                                 errors, set to the current id from AI Studio,
//                                 e.g. "gemini-2.5-flash-image" (Nano Banana 1).

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
// Treat empty / whitespace / an unexpanded "${GEMINI_API_KEY}" placeholder as
// "not set", so the user gets a clear message instead of a confusing 400.
const RAW_KEY = process.env.GEMINI_API_KEY || "";
const API_KEY = /^\s*$/.test(RAW_KEY) || RAW_KEY.includes("${") ? "" : RAW_KEY.trim();

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const TOOL = {
  name: "generate_image",
  description:
    "Generate an image with Google Gemini (Nano Banana) and write it to disk. " +
    "Pass a detailed prompt; optionally pass reference image paths to keep " +
    "character/style consistency. Returns the saved file path.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Full positive prompt." },
      negativePrompt: { type: "string", description: "What to avoid (appended as guidance)." },
      outPath: { type: "string", description: "Where to write the image, relative to repo root (e.g. public/assets/chars/ryo.v1.normal.png)." },
      referenceImagePaths: {
        type: "array",
        items: { type: "string" },
        description: "Optional reference images (paths) to condition on for consistency.",
      },
      aspectRatio: { type: "string", description: "e.g. '9:16', '1:1'. Default '2:3'." },
    },
    required: ["prompt", "outPath"],
  },
};

function partsFromRefs(paths = []) {
  return paths.map((p) => {
    const data = readFileSync(resolve(process.cwd(), p)).toString("base64");
    const mimeType = MIME[extname(p).toLowerCase()] || "image/png";
    return { inlineData: { mimeType, data } };
  });
}

async function generate(ai, args) {
  const { prompt, negativePrompt, outPath, referenceImagePaths, aspectRatio } = args;
  const fullPrompt =
    prompt +
    (aspectRatio ? `\n\nAspect ratio: ${aspectRatio}.` : "\n\nAspect ratio: 2:3 (vertical).") +
    (negativePrompt ? `\n\nAvoid: ${negativePrompt}.` : "");

  const parts = [{ text: fullPrompt }, ...partsFromRefs(referenceImagePaths)];

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["IMAGE", "TEXT"] },
  });

  const cand = res?.candidates?.[0];
  const outParts = cand?.content?.parts || [];
  const img = outParts.find((p) => p.inlineData?.data);
  if (!img) {
    const txt = outParts.find((p) => p.text)?.text || "no image returned";
    throw new Error(`Model returned no image. Detail: ${txt}`);
  }
  const abs = resolve(process.cwd(), outPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(img.inlineData.data, "base64"));
  return abs;
}

const server = new Server(
  { name: "metal-road-image-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== TOOL.name) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  if (!API_KEY) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "GEMINI_API_KEY is not set (or is an unexpanded ${GEMINI_API_KEY} placeholder). Set a valid key in the environment that launches this MCP server, then restart.",
        },
      ],
    };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const path = await generate(ai, req.params.arguments || {});
    return { content: [{ type: "text", text: `Saved image to ${path}` }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Generation failed: ${err?.message || err}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
