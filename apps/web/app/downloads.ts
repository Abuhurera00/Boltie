// Download links for the landing page. The release workflow
// (.github/workflows/release.yml) uploads assets under these exact names, so
// "latest/download/<name>" always points at the newest build.

export const repo = "https://github.com/Abuhurera00/boltie";
export const releases = `${repo}/releases`;
const latest = `${releases}/latest/download`;

export type Platform = "windows" | "mac-arm" | "mac-intel";

export type Download = {
  platform: Platform;
  label: string;
  file: string;
  href: string;
  note: string;
};

export const downloads: Download[] = [
  { platform: "windows", label: "Windows", file: "Boltie-windows-x64-setup.exe", href: `${latest}/Boltie-windows-x64-setup.exe`, note: "Windows 10 and 11, 64-bit" },
  { platform: "mac-arm", label: "macOS (Apple silicon)", file: "Boltie-macos-arm64.dmg", href: `${latest}/Boltie-macos-arm64.dmg`, note: "M1 and newer, macOS 11+" },
  { platform: "mac-intel", label: "macOS (Intel)", file: "Boltie-macos-x64.dmg", href: `${latest}/Boltie-macos-x64.dmg`, note: "Intel Macs, macOS 11+" },
];

/**
 * Best guess at the visitor's platform. Browsers don't reveal Apple silicon
 * vs Intel reliably, so Macs default to Apple silicon and the page should
 * always list the other builds too. Returns null on phones and Linux.
 */
export function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac-arm";
  return null;
}

export function downloadFor(platform: Platform | null): Download | undefined {
  return downloads.find((d) => d.platform === platform);
}
