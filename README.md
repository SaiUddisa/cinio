# Cinio

> **Cinio** (short for "see in io") is a sleek, minimalistic, and premium web GUI designed to explore, configure, and manage MinIO object storage servers.

Built with **Next.js** and **React**, styled with custom **Vanilla CSS** (for maximum design flexibility and high-fidelity aesthetics), and backed by a local proxy using the official **MinIO SDK** to bypass browser CORS limitations seamlessly.

---

## ✨ Features

- **Connection Profiles**: Save credentials securely in browser local storage and switch profiles on the fly.
- **Connection Testing**: Validate connection parameters live before saving them.
- **Bucket Operations**: List, create, and delete buckets.
- **Simulated File Explorer**: Multi-level virtual folder traversal with interactive breadcrumbs.
- **Drag & Drop Upload**: Drag one or more files from your desktop and drop them onto the workspace.
- **Live Text/Code Editor**: Open, view, edit, and save text-based files (`.txt`, `.json`, `.js`, `.css`, `.md`, `.yaml`, etc.) directly to your MinIO bucket.
- **Rich Media Preview**: In-app image preview and HTML5 audio/video native players.
- **Link Sharing**: Generate temporary 24-hour presigned download links with one click.
- **Recursive Deletion**: Delete folders and all their nested directories and objects.
- **Premium Aesthetics**: Curated violet/indigo dark-mode palette, custom scrollbars, micro-animations, and smooth backdrop-blur modal transitions.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js App Router (React 19, client-side state)
- **Backend APIs**: Next.js stateless API route proxies
- **Storage Client**: `minio` JavaScript SDK
- **Styling**: Pure Vanilla CSS (CSS variables, backdrop filters, custom layouts)
- **Icons**: `lucide-react`

---

## 🚀 Getting Started

### 1. Installation
Install the project dependencies:
```bash
npm install
```

### 2. Run the App
Start the Next.js local development server:
```bash
npm run dev
```

The app will start on [http://localhost:3000](http://localhost:3000).

### 3. Connect to MinIO
To start exploring, click **Configure Connection Profile** and input your MinIO server credentials. 

To test using MinIO's public playground, fill in:
- **Profile Name**: MinIO Play
- **Endpoint**: `play.min.io`
- **Access Key**: `minioadmin`
- **Secret Key**: `minioadmin`
- **Use SSL**: Check this checkbox (requires HTTPS)
- Click **Test Connection** to verify, then click **Save Profile**!
