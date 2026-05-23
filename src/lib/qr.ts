import QRCode from "qrcode";

type QrOptions = {
  scale?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
};

const DEFAULT_DARK = "#0F1F3D";
const DEFAULT_LIGHT = "#FFFFFF";

export async function generateQrSvg(
  data: string,
  options: QrOptions = {}
): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: options.margin ?? 1,
    color: {
      dark: options.darkColor ?? DEFAULT_DARK,
      light: options.lightColor ?? DEFAULT_LIGHT
    }
  });
}

export async function generateQrDataUrl(
  data: string,
  options: QrOptions = {}
): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "H",
    margin: options.margin ?? 1,
    scale: options.scale ?? 8,
    color: {
      dark: options.darkColor ?? DEFAULT_DARK,
      light: options.lightColor ?? DEFAULT_LIGHT
    }
  });
}
