export async function generateQrSvg(data: string) {
  const escaped = data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360" fill="none">
      <rect width="360" height="360" rx="32" fill="#F9F6F1" />
      <rect x="36" y="36" width="288" height="288" rx="24" fill="#143127" />
      <path d="M96 96h72v72H96zM192 96h72v72h-72zM96 192h72v72H96z" fill="#F9F6F1" />
      <text x="180" y="314" fill="#F9F6F1" font-size="14" font-family="monospace" text-anchor="middle">
        ${escaped}
      </text>
    </svg>
  `.trim();
}
