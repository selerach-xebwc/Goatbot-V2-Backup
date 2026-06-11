const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const BASE_URL = "https://nkximggen.onrender.com";

const MODELS = {
  "gpt-image-2":        { alias: ["gpt2", "gpt"],       credits: 4,  i2iOnly: false, name: "GPT Image 2" },
  "nano-banana":        { alias: ["nano", "nb"],         credits: 5,  i2iOnly: false, name: "Nano Banana" },
  "nano-banana-pro":    { alias: ["nbpro", "nanopro"],   credits: 30, i2iOnly: false, name: "Nano Banana Pro" },
  "nano-banana-2":      { alias: ["nano2", "nb2"],       credits: 20, i2iOnly: false, name: "Nano Banana 2" },
  "seedream-4":         { alias: ["sd4", "seed4"],       credits: 5,  i2iOnly: false, name: "Seedream 4.0" },
  "seedream-4-5":       { alias: ["sd45", "seed45"],     credits: 6,  i2iOnly: false, name: "Seedream 4.5" },
  "seedream-5-lite":    { alias: ["sd5", "seed5"],       credits: 8,  i2iOnly: false, name: "Seedream 5.0 Lite" },
  "pruna-image-editor": { alias: ["pruna", "pe"],        credits: 5,  i2iOnly: true,  name: "Pruna Image Editor" },
  "qwen-image-editor":  { alias: ["qwen", "qw"],         credits: 6,  i2iOnly: true,  name: "Qwen Image Editor" },
};

function resolveModel(input) {
  if (!input) return "gpt-image-2";
  const lower = input.toLowerCase();
  if (MODELS[lower]) return lower;
  for (const [id, info] of Object.entries(MODELS)) {
    if (info.alias.includes(lower)) return id;
  }
  return null;
}

function parseArgs(args) {
  let prompt = args.join(" ");
  let model = "gpt-image-2";
  let aspectRatio = "1:1";
  let n = 1;

  const mMatch = prompt.match(/--m\s+(\S+)/i);
  if (mMatch) {
    const resolved = resolveModel(mMatch[1]);
    if (resolved) model = resolved;
    prompt = prompt.replace(mMatch[0], "").trim();
  }

  const arMatch = prompt.match(/--ar\s+(\S+)/i);
  if (arMatch) {
    aspectRatio = arMatch[1];
    prompt = prompt.replace(arMatch[0], "").trim();
  }

  const nMatch = prompt.match(/--n\s+([1-4])/i);
  if (nMatch) {
    n = parseInt(nMatch[1]);
    prompt = prompt.replace(nMatch[0], "").trim();
  }

  return { prompt: prompt.trim(), model, aspectRatio, n };
}

function buildModelsMessage() {
  const lines = ["NKXGEN MODELS\n"];
  const sections = [
    { label: "GPT Image",              ids: ["gpt-image-2"] },
    { label: "Nano Banana",            ids: ["nano-banana", "nano-banana-pro", "nano-banana-2"] },
    { label: "Seedream",               ids: ["seedream-4", "seedream-4-5", "seedream-5-lite"] },
    { label: "Editors (img2img only)", ids: ["pruna-image-editor", "qwen-image-editor"] },
  ];
  for (const section of sections) {
    lines.push(`--- ${section.label} ---`);
    for (const id of section.ids) {
      const m = MODELS[id];
      lines.push(`${id} [${m.alias.slice(0, 2).join(", ")}]  ${m.credits} credits`);
    }
    lines.push("");
  }
  lines.push("Flags: --m <model>  --ar <ratio>  --n <1-4>");
  lines.push("Example: nkxgen sunset --m sd5 --ar 16:9");
  lines.push("Edit image: reply to a photo with nkxgen <prompt>");
  return lines.join("\n");
}

module.exports = {
  config: {
    name: "nkxgen",
    aliases: ["nkx"],
    version: "3.0.0",
    author: "Neoaz",
    countDown: 10,
    role: 0,
    shortDescription: { en: "Generate or edit images with 9 AI models" },
    longDescription: { en: "AI image generation and editing. Type 'nkxgen models' to see all available models and shortcuts." },
    category: "ai",
    guide: {
      en: [
        "{pn} <prompt>",
        "{pn} <prompt> --m <model>",
        "{pn} <prompt> --ar 16:9",
        "{pn} <prompt> --m sd5 --ar 16:9 --n 2",
        "{pn} models",
        "Reply to a photo: {pn} <prompt> --m nano",
      ].join("\n"),
    },
  },

  onStart: async function ({ message, event, args }) {
    const input = args.join(" ").trim();

    if (!input || input.toLowerCase() === "models") {
      return message.reply(buildModelsMessage());
    }

    const { prompt, model, aspectRatio, n } = parseArgs(args);
    const modelInfo = MODELS[model];

    // Grab attached image if replying to a photo
    let imageUrl = null;
    if (event.type === "message_reply") {
      const atts = event.messageReply.attachments || [];
      const photo = atts.find(a => a.type === "photo");
      if (photo) imageUrl = photo.url;
    }

    // Guard: editors need an image
    if (modelInfo.i2iOnly && !imageUrl) {
      return message.reply(
        `${model} only supports image editing.\n` +
        `Reply to a photo with your prompt, or use a generate model (e.g. gpt2, nano, sd5).`
      );
    }

    if (!prompt && !imageUrl) {
      return message.reply("Please provide a prompt, or reply to an image.\nType nkxgen models to see all models.");
    }

    const summary = [`Model: ${model}`, `Ratio: ${aspectRatio}`, n > 1 ? `Count: ${n}` : null]
      .filter(Boolean).join(" | ");
    await message.reply(imageUrl ? `Editing image...\n${summary}` : `Generating...\n${summary}`);

    try {
      let response;

      if (imageUrl) {
        // POST /v1/images/edits/url — JSON body with image URL
        response = await axios.post(
          `${BASE_URL}/v1/images/edits/url`,
          {
            image_url: imageUrl,
            prompt: prompt || "Edit this image",
            model,
            n,
            aspect_ratio: aspectRatio,
          },
          { timeout: 180000 }
        );
      } else {
        // POST /v1/images/generations — text-to-image
        response = await axios.post(
          `${BASE_URL}/v1/images/generations`,
          {
            prompt,
            model,
            n,
            aspect_ratio: aspectRatio,
          },
          { timeout: 180000 }
        );
      }

      const images = (response.data.data || []).map(d => d.url).filter(Boolean);
      if (!images.length) throw new Error("No images returned by the API.");

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      const attachments = [];
      const filePaths = [];

      for (const url of images) {
        const filePath = path.join(cacheDir, `nkxgen_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
        const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 });
        await fs.writeFile(filePath, Buffer.from(imgRes.data));
        attachments.push(fs.createReadStream(filePath));
        filePaths.push(filePath);
      }

      await message.reply({ body: `Done — ${MODELS[model].name}`, attachment: attachments });

      filePaths.forEach(p => fs.remove(p).catch(() => {}));

    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.error || err.message || "Unknown error";
      message.reply(`Error: ${msg}`);
    }
  },
};
