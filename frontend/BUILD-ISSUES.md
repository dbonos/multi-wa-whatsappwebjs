# 🔧 Frontend Build Issues & Solutions

## ⚠️ **Current Issues**

### **1. Node.js Version**
- **Current**: Node.js v18.7.0
- **Required**: Node.js v20.19+ or v22.12+
- **Impact**: Vite 7 requires newer Node.js version

**Solution**: 
```bash
# Upgrade Node.js menggunakan nvm (recommended)
nvm install 20
nvm use 20

# Atau install Node.js 20+ dari nodejs.org
```

### **2. Tailwind CSS v4 Compatibility**
- **Issue**: Tailwind CSS v4 has different syntax
- **Problem**: Custom colors (`bg-whatsapp`, `text-whatsapp`) tidak bisa digunakan di `@apply`
- **Files Affected**: 
  - `src/index.css` - Custom classes dengan `@apply bg-whatsapp`
  - Multiple components menggunakan `bg-whatsapp`, `text-whatsapp`, etc.

**Solution Options**:

#### **Option A: Downgrade to Tailwind CSS v3** (Recommended)
```bash
cd frontend
npm uninstall tailwindcss @tailwindcss/postcss
npm install tailwindcss@^3.4.0 postcss autoprefixer
```

Update `postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### **Option B: Use CSS Variables** (Keep v4)
Replace semua `bg-whatsapp` dengan `bg-[#25D366]` atau CSS variables.

---

## ✅ **Quick Fix (Recommended)**

### **Downgrade to Tailwind CSS v3**

```bash
cd frontend

# Uninstall v4
npm uninstall tailwindcss @tailwindcss/postcss

# Install v3
npm install tailwindcss@^3.4.0

# Update postcss.config.js
```

Update `postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 🧪 **Testing After Fix**

```bash
# Test build
npm run build

# Test dev server
npm run dev
```

---

## 📝 **Notes**

- Tailwind CSS v4 masih dalam development
- v3 lebih stable untuk production
- Custom colors work fine di v3 dengan config di `tailwind.config.js`

---

**Status**: ⚠️ Needs Node.js upgrade + Tailwind CSS v3 downgrade

