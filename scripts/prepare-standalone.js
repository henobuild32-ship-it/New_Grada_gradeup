const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const staticDir = path.join(projectRoot, ".next", "static");
const standaloneStaticDir = path.join(standaloneDir, ".next", "static");

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  throw new Error("Le build standalone est absent. Exécutez `npm run build`.");
}

const standalonePackageFile = path.join(standaloneDir, "package.json");
const standalonePackage = JSON.parse(
  fs.readFileSync(standalonePackageFile, "utf8"),
);
standalonePackage.scripts = {
  ...standalonePackage.scripts,
  start: "node server.js",
};
fs.writeFileSync(
  standalonePackageFile,
  `${JSON.stringify(standalonePackage, null, 2)}\n`,
);

if (process.platform !== "linux") {
  const sharpPackage = require(
    path.join(projectRoot, "node_modules", "sharp", "package.json"),
  );
  const linuxSharpPackages = [
    "@img/sharp-linux-x64",
    "@img/sharp-libvips-linux-x64",
  ];

  for (const packageName of linuxSharpPackages) {
    const version = sharpPackage.optionalDependencies?.[packageName];
    if (!version) {
      throw new Error(`Version manquante pour ${packageName} dans sharp.`);
    }

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "gradeup-sharp-linux-"),
    );
    try {
      const pack = spawnSync(
        "npm",
        [
          "pack",
          `${packageName}@${version}`,
          "--pack-destination",
          tempDir,
          "--silent",
        ],
        { encoding: "utf8", shell: process.platform === "win32" },
      );
      if (pack.status !== 0) {
        throw new Error(
          `Téléchargement de ${packageName} impossible : ${pack.stderr.trim()}`,
        );
      }

      const archiveName = pack.stdout.trim().split(/\r?\n/).pop();
      execFileSync("tar", [
        "-xf",
        path.join(tempDir, archiveName),
        "-C",
        tempDir,
      ]);
      const packageDir = path.join(
        standaloneDir,
        "node_modules",
        ...packageName.split("/"),
      );
      fs.mkdirSync(path.dirname(packageDir), { recursive: true });
      fs.cpSync(path.join(tempDir, "package"), packageDir, {
        recursive: true,
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

fs.mkdirSync(standaloneStaticDir, { recursive: true });
fs.cpSync(staticDir, standaloneStaticDir, { recursive: true });

const publicDir = path.join(projectRoot, "public");
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, "public"), {
    recursive: true,
  });
}

const envFile = path.join(projectRoot, ".env");
if (fs.existsSync(envFile)) {
  fs.copyFileSync(envFile, path.join(standaloneDir, ".env"));
} else {
  console.warn("Aucun fichier .env local : configurez les variables sur l'hébergeur.");
}

console.log("Dossier de déploiement prêt : .next/standalone");
