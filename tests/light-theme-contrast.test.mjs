import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const stylesheet = fs.readFileSync("app/globals.css", "utf8");

const lightTonePairs = [
  { name: "info", foreground: "#075985", background: "#e0f2fe" },
  { name: "success", foreground: "#166534", background: "#dcfce7" },
  { name: "warning", foreground: "#92400e", background: "#fef3c7" },
  { name: "danger", foreground: "#9f1239", background: "#ffe4e6" }
];

function relativeLuminance(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test("light-theme semantic tones meet WCAG AA text contrast", () => {
  for (const pair of lightTonePairs) {
    assert.ok(
      contrastRatio(pair.foreground, pair.background) >= 4.5,
      `${pair.name} text must have at least 4.5:1 contrast`
    );
    assert.match(stylesheet, new RegExp(pair.foreground, "i"));
    assert.match(stylesheet, new RegExp(pair.background, "i"));
  }
});

test("light-theme overrides cover shared status text utilities", () => {
  for (const className of [
    "text-cyan-200",
    "text-emerald-100",
    "text-amber-100/80",
    "text-rose-100"
  ]) {
    assert.ok(stylesheet.includes(`[class~="${className}"]`), `${className} needs a light-mode override`);
  }
});
