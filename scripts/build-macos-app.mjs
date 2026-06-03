#!/usr/bin/env node

import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appName = 'MacClean Lens';
const appRoot = resolve(root, 'dist', `${appName}.app`);
const contents = resolve(appRoot, 'Contents');
const macOS = resolve(contents, 'MacOS');
const resources = resolve(contents, 'Resources');
const bundledApp = resolve(resources, 'app');
const iconName = 'MacCleanLens.icns';

async function copyProject() {
  await cp(resolve(root, 'bin'), resolve(bundledApp, 'bin'), { recursive: true });
  await cp(resolve(root, 'src/core'), resolve(bundledApp, 'src/core'), { recursive: true });
  await cp(resolve(root, 'src/server'), resolve(bundledApp, 'src/server'), { recursive: true });
  await cp(resolve(root, 'src/ui'), resolve(bundledApp, 'src/ui'), { recursive: true });
  await cp(resolve(root, 'package.json'), resolve(bundledApp, 'package.json'));
  await cp(resolve(root, 'README.md'), resolve(bundledApp, 'README.md'));
  await cp(resolve(root, 'LICENSE'), resolve(bundledApp, 'LICENSE'));
}

async function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleExecutable</key>
  <string>${appName}</string>
  <key>CFBundleIdentifier</key>
  <string>dev.maccleanlens.app</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundleIconFile</key>
  <string>${iconName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
  await writeFile(resolve(contents, 'Info.plist'), plist);
}

async function createIcon() {
  const tempDir = await mkdtemp(join(tmpdir(), 'mac-clean-lens-icon-'));
  const swiftSource = resolve(tempDir, 'RenderIcon.swift');
  const renderer = resolve(tempDir, 'render-icon');
  const sourcePng = resolve(tempDir, 'MacCleanLens-1024.png');
  const iconset = resolve(tempDir, 'MacCleanLens.iconset');
  const swift = `
import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)

image.lockFocus()
NSColor(calibratedRed: 0.94, green: 0.97, blue: 1.0, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 1024, height: 1024), xRadius: 220, yRadius: 220).fill()

let gradient = NSGradient(colors: [
  NSColor(calibratedRed: 0.13, green: 0.46, blue: 1.0, alpha: 1),
  NSColor(calibratedRed: 0.04, green: 0.62, blue: 0.43, alpha: 1)
])!
gradient.draw(in: NSBezierPath(roundedRect: NSRect(x: 96, y: 96, width: 832, height: 832), xRadius: 190, yRadius: 190), angle: 135)

NSColor.white.withAlphaComponent(0.95).setStroke()
let lens = NSBezierPath(ovalIn: NSRect(x: 278, y: 404, width: 300, height: 300))
lens.lineWidth = 58
lens.stroke()

let handle = NSBezierPath()
handle.lineWidth = 64
handle.lineCapStyle = .round
handle.move(to: NSPoint(x: 548, y: 392))
handle.line(to: NSPoint(x: 724, y: 216))
handle.stroke()

NSColor.white.withAlphaComponent(0.86).setFill()
for (index, height) in [96, 142, 216].enumerated() {
  let rect = NSRect(x: 294 + index * 120, y: 238, width: 70, height: height)
  NSBezierPath(roundedRect: rect, xRadius: 28, yRadius: 28).fill()
}

let rep = NSBitmapImageRep(focusedViewRect: NSRect(x: 0, y: 0, width: 1024, height: 1024))!
image.unlockFocus()
try rep.representation(using: .png, properties: [:])!.write(to: output)
`;

  await writeFile(swiftSource, swift);
  await execFileAsync('swiftc', [swiftSource, '-o', renderer, '-framework', 'AppKit']);
  await execFileAsync(renderer, [sourcePng]);
  await mkdir(iconset, { recursive: true });

  const specs = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ];

  for (const [fileName, size] of specs) {
    await execFileAsync('sips', ['-z', String(size), String(size), sourcePng, '--out', resolve(iconset, fileName)]);
  }

  await execFileAsync('iconutil', ['-c', 'icns', iconset, '-o', resolve(resources, iconName)]);
  await rm(tempDir, { recursive: true, force: true });
}

async function build() {
  await rm(appRoot, { recursive: true, force: true });
  await mkdir(macOS, { recursive: true });
  await mkdir(resources, { recursive: true });
  await copyProject();
  await writeInfoPlist();
  await createIcon();

  await execFileAsync('swiftc', [
    resolve(root, 'src/native/MacCleanLensApp.swift'),
    '-o',
    resolve(macOS, appName),
    '-framework',
    'Cocoa',
    '-framework',
    'WebKit'
  ]);

  await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appRoot]);
  console.log(appRoot);
}

build().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
