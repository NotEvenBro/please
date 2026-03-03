# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Jellyfin transcoding notes (TV playback)

If TV playback is failing or quality looks lower than expected, it's useful to separate **player behavior** from **server transcoding behavior**:

- `react-tv-player` (or any alternate React video wrapper) does **not** perform transcoding itself.
- Jellyfin does transcoding on the **server** using FFmpeg (CPU or GPU acceleration if configured).
- The TV/browser only decodes what it receives (direct stream or already-transcoded HLS segments).

### Would switching to `react-tv-player` fix transcoding?

Usually no. It may improve remote-control UX in some apps, but it will not fix server-side manifest/transcode failures or raise transcoded quality by itself.

### What actually affects transcoded quality

1. Jellyfin playback profile and selected output codecs/containers.
2. Allowed streaming bitrate / max bitrate caps.
3. Hardware acceleration path (NVENC/Quick Sync/VAAPI/AMF) and FFmpeg support.
4. Whether subtitles are burned-in (can force heavier transcoding).
5. Source media constraints (HDR, 10-bit, unsupported codecs, high bitrate spikes).

### Practical recommendation

- Keep the current HLS playback path (`hls.js`) for browser compatibility.
- Tune quality in Jellyfin server settings (bitrate caps + hardware acceleration) rather than replacing the frontend player library.
- Use direct play whenever possible, and only enable compatibility transcode for devices/codecs that need it.
