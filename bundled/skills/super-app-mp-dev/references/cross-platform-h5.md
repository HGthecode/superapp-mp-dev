# 跨端 H5 适配

同一份包同时跑在开放平台手机预览框与以后的 App WebView。

## 触摸

```css
body { -webkit-touch-callout: none; }
.touchable:active { opacity: 0.7; }
html { touch-action: manipulation; }
```

交互优先用 Pointer Events。

## 滚动

```css
.scroll-container {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}
```

## 安全区

```css
.custom-nav { padding-top: env(safe-area-inset-top, 0px); }
.bottom-bar { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

需配合 `viewport-fit=cover`。

## 布局

- 容器用 `%` / `flex` / `vw`，勿写死 `width: 375px`
- 图片 `max-width: 100%`
- 用系统字体栈

## 自检

- [ ] 关键操作不依赖 hover
- [ ] 布局自适应
- [ ] 安全区用 `env()` + fallback
