import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

const saved = localStorage.getItem("lang");
const lng = saved === "en-US" || saved === "zh-CN" ? saved : "zh-CN";

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS }, // 可以是空对象
  },

  lng,
  // ✅ 关键：英文缺失时回退到中文
  fallbackLng: "zh-CN",

  // ✅ 关键：避免某些情况下返回 null / 空字符串导致渲染奇怪
  returnNull: false,
  returnEmptyString: false,

  interpolation: {
    escapeValue: false,
  },

  // 可选：开发时帮助你发现漏翻译
  // saveMissing: true,
  // missingKeyHandler: (lngs, ns, key) => { console.warn("missing i18n key:", key); }
});

export default i18n;
