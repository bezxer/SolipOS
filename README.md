# SolipOS

SolipOS turns a browser tab into the control room of your home server. Open it and you see what's running, how busy the machine is, and every app you've installed, each one a click away. Behind that sits everything you need to look after the box: containers, images, a terminal and a file manager.

It runs as a single Docker container and talks to the Docker engine on the host, so you can try it in a minute and remove it just as fast.

<img width="1440" height="809" alt="Screenshot 2026-11-24 at 9 54 26 AM" src="https://github.com/user-attachments/assets/3de8a3a6-42e2-46f1-b378-f6575d3f41ab" />

<img width="1440" height="808" alt="Screenshot 2026-11-24 at 10 00 55 AM" src="https://github.com/user-attachments/assets/da702027-edbc-4033-8f72-bb032e00c53b" />

<img width="1440" height="808" alt="Screenshot 2026-11-24 at 10 00 00 AM" src="https://github.com/user-attachments/assets/98253e1b-3039-4a2f-b6e9-b23f0d593d1c" />


## What it does

- **Keeps an eye on the server.** CPU, memory, disk and Docker are on screen the moment you log in, and they update while you watch.
- **Installs apps.** Drop in a `.zip` or `.tar.gz`, paste a compose file, or give it an image name. SolipOS works out the rest.
- **Updates them.** It checks registries for newer images and marks what's out of date. One click pulls the new image and recreates the container with the same ports, volumes, variables and networks. If the new container fails to start, the old one comes back.
- **Manages containers.** Start, stop, restart, read the logs, open a shell inside. Compose projects are grouped together, so a five-container stack stays one thing.
- **Gives you a terminal** on the host itself or inside any container, right in the browser.
- **Handles files.** Browse the whole disk, edit text files, and upload by dragging files or entire folders in, or by pasting from the clipboard.

## Getting started

```
git clone https://github.com/<you>/solipos.git
cd solipos
docker compose up -d --build
```

Open `http://<server-ip>:7745`. On the first visit you'll be asked to create a username and password. Do this straight away: until an account exists, anyone on your network can create one.

The password is stored only as a scrypt hash in `DATA_DIR/users.json`. You can change your username or password later under Settings → Account.

## Installing apps

Click **Install** and choose how to bring the app in.

**From an archive** (`.zip`, `.tar`, `.tar.gz`, `.tgz`). SolipOS looks inside and decides what to do:

- If there's a `docker-compose.yml` or `compose.yml`, it runs `docker compose up -d --build`. Any `*.tar` images next to it (or in an `images/` folder) are loaded first, so apps can be installed with no internet access.
- If there's a `Dockerfile`, it builds the image and starts a container with the ports, volumes and variables you set.
- If the archive is an image saved with `docker save`, it loads and starts it.

A single wrapper folder inside the archive is skipped automatically.

**From a compose file.** Paste the YAML and give the app a name.

**From an image.** Fill in the image, ports, volumes and variables, the same things you'd pass to `docker run`.

To update an app from a newer archive, use **Update from archive** in its menu. New files are copied over the old ones, everything else (like a `./data` folder) stays put, and the app is rebuilt or restarted. Compose apps can also be edited in place: change the YAML and press **Apply**.

Apps live in `APPS_DIR` (`/opt/solipos/apps/<name>` by default). The folder is mounted at the same path on the host and in the container, so relative volumes like `./data` in compose files point where you expect.

## Containers and updates

Your apps, compose stacks and any container you can open in a browser show up on the start screen. A container counts as openable if it publishes a port or runs with `network_mode: host`. For host-network containers, the port is taken from the image's `EXPOSE`, or you can set it yourself under the tile's menu → Customize → Main port.

Want to see everything, including stopped containers and ones without ports? Turn on Settings → Desk → All containers.

Image updates are checked when SolipOS starts and every six hours after that. Images built locally have nothing to compare against, so they're skipped. SolipOS won't update its own container, since that would stop it halfway through. To update SolipOS itself, run `docker compose pull && docker compose up -d --build` in its folder.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `7745` | Port the panel listens on |
| `FILES_ROOT` | `/` | Root folder for the file manager |
| `USE_NSENTER` | `0` | `1` opens the terminal on the host (needs `pid: host` and `privileged`) |
| `APPS_DIR` | `./apps` | Where installed apps are kept |
| `DATA_DIR` | `./data` | Settings, account, wallpapers and icons |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Path to the Docker socket |
| `ADMIN_USER`, `PASSWORD` | — | Optional. Log in with these instead of creating an account on first visit |

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Alt+1 … Alt+5 | Open a section; press again to minimise it |
| Alt+D | Show the start screen |
| Ctrl+K or / | Search |
| Ctrl+S | Save in the editor |

## Project layout

```
server.js            entry point: Express, routes, WebSocket
src/
  config.js          environment, paths, Docker client
  util.js            errors, cookies, JSON files
  auth.js            login, first-run setup, sessions, account
  settings.js        settings, wallpapers, icons
  system.js          CPU, memory, disk, Docker
  docker.js          shared Docker helpers
  updates.js         image update checks and container recreation
  containers.js      containers, stacks, images
  apps.js            app install from archives and compose
  files.js           file manager
  jobs.js            background jobs with live logs
  terminal.js        host and container terminals
public/
  index.html
  css/               styles
  js/
    i18n.js          Ukrainian, Russian and English texts
    core.js          helpers, API, dialogs, theme
    wm.js            windows, dock, search
    apps.js … tools.js   section windows
    desk.js          start screen
    install.js       app installation
    settings.js      settings
    boot.js          login and startup
```

## Security

SolipOS has full root access to your server: it controls Docker, reads and writes any file, and opens a root shell. Keep it on your local network, behind a VPN, or behind a reverse proxy with HTTPS. Don't expose port 7745 to the internet.
