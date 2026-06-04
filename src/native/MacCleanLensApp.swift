import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var serverProcess: Process?
    private var didLoadServer = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        createWindow()
        startServer()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    private func createWindow() {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.uiDelegate = self
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let width: CGFloat = min(1180, screenFrame.width - 80)
        let height: CGFloat = min(780, screenFrame.height - 80)
        let frame = NSRect(
            x: screenFrame.midX - width / 2,
            y: screenFrame.midY - height / 2,
            width: width,
            height: height
        )

        let appWindow = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        appWindow.title = "MacClean Lens"
        appWindow.minSize = NSSize(width: 900, height: 620)
        appWindow.contentView = view
        appWindow.makeKeyAndOrderFront(nil)

        window = appWindow
        webView = view
    }

    private func startServer() {
        guard let resourcePath = Bundle.main.resourcePath else {
            showError("找不到应用资源目录")
            return
        }
        guard let nodePath = findNodeExecutable() else {
            showError("找不到可用的 Node.js 运行时。请在终端运行 mac-clean-lens-install 重新安装应用，或直接运行 mac-clean-lens。")
            return
        }

        let scriptPath = "\(resourcePath)/app/bin/mac-clean-lens.mjs"
        let nodeDirectory = URL(fileURLWithPath: nodePath).deletingLastPathComponent().path
        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [scriptPath, "--no-open"]
        process.environment = [
            "HOME": NSHomeDirectory(),
            "PATH": "\(nodeDirectory):/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"
        ]

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        let logURL = serverLogURL()

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let text = String(data: handle.availableData, encoding: .utf8) ?? ""
            self?.appendLog(text, to: logURL)
            guard let url = self?.extractURL(from: text) else { return }
            DispatchQueue.main.async {
                self?.load(url: url)
            }
        }

        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let text = String(data: handle.availableData, encoding: .utf8) ?? ""
            self?.appendLog(text, to: logURL)
            if !text.isEmpty {
                NSLog("MacClean Lens server: \(text)")
            }
        }

        do {
            try process.run()
            serverProcess = process
        } catch {
            showError("无法启动内置服务：\(error.localizedDescription)")
        }
    }

    private func findNodeExecutable() -> String? {
        let home = NSHomeDirectory()
        let candidates = [
            "\(Bundle.main.bundlePath)/Contents/Resources/runtime/node",
            "\(home)/.volta/bin/node",
            "\(home)/.nvm/current/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node"
        ]
        for candidate in candidates {
            if FileManager.default.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }
        return nil
    }

    private func extractURL(from text: String) -> URL? {
        guard let range = text.range(of: #"http://127\.0\.0\.1:[0-9]+"#, options: .regularExpression) else {
            return nil
        }
        return URL(string: String(text[range]))
    }

    private func serverLogURL() -> URL {
        let directory = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library")
            .appendingPathComponent("Logs")
            .appendingPathComponent("MacCleanLens")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("server.log")
    }

    private func appendLog(_ text: String, to url: URL) {
        guard !text.isEmpty, let data = text.data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: url.path),
           let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        } else {
            try? data.write(to: url)
        }
    }

    private func load(url: URL) {
        guard !didLoadServer else { return }
        didLoadServer = true
        webView?.load(URLRequest(url: url))
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "MacClean Lens 启动失败"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "MacClean Lens"
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "确认清理"
        alert.informativeText = message
        alert.addButton(withTitle: "继续")
        alert.addButton(withTitle: "取消")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
