//
//  CrashReporter.swift
//  Comprehensive crash reporting and signal handling
//

import Foundation
import os.log
import Darwin

// Global logger
private let crashLogger = Logger(subsystem: "com.mikeyb.girlai2", category: "CrashReporter")

// Global C-compatible exception handler
@_cdecl("uncaughtExceptionHandler")
func uncaughtExceptionHandler(_ exception: NSException) {
    let reason = exception.reason ?? "Unknown reason"
    let name = exception.name.rawValue
    let callStack = exception.callStackSymbols.joined(separator: "\n")
    
    let crashReport = """
    ========== CRASH REPORT ==========
    Exception: \(name)
    Reason: \(reason)
    Stack Trace:
    \(callStack)
    ===================================
    """
    
    crashLogger.critical("\(crashReport)")
    NSLog("❌ CRASH: \(crashReport)")
    
    CrashReporter.writeCrashLog(crashReport)
}

// Global C-compatible signal handler function
private func signalHandler(_ sig: Int32) {
    let signalName: String
    switch sig {
    case SIGABRT: signalName = "SIGABRT"
    case SIGILL: signalName = "SIGILL"
    case SIGSEGV: signalName = "SIGSEGV"
    case SIGFPE: signalName = "SIGFPE"
    case SIGBUS: signalName = "SIGBUS"
    case SIGPIPE: signalName = "SIGPIPE"
    default: signalName = "UNKNOWN(\(sig))"
    }
    
    let crashReport = """
    ========== SIGNAL CRASH ==========
    Signal: \(signalName)
    Thread: \(Thread.current)
    ===================================
    """
    
    crashLogger.critical("\(crashReport)")
    NSLog("❌ SIGNAL CRASH: \(crashReport)")
    
    CrashReporter.writeCrashLog(crashReport)
    
    // Restore default handler and re-raise
    Darwin.signal(sig, SIG_DFL)
    Darwin.raise(sig)
}

@objc class CrashReporter: NSObject {
    static let logger = crashLogger
    
    static func setup() {
        // Set up exception handler for Objective-C exceptions
        NSSetUncaughtExceptionHandler(uncaughtExceptionHandler)
        
        // Set up signal handlers for C-level crashes
        Darwin.signal(SIGABRT, signalHandler)
        Darwin.signal(SIGILL, signalHandler)
        Darwin.signal(SIGSEGV, signalHandler)
        Darwin.signal(SIGFPE, signalHandler)
        Darwin.signal(SIGBUS, signalHandler)
        Darwin.signal(SIGPIPE, signalHandler)
        
        crashLogger.info("Crash reporting initialized")
        NSLog("✅ Crash reporting initialized")
    }
    
    static func writeCrashLog(_ report: String) {
        guard let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return
        }
        
        let crashLogPath = documentsPath.appendingPathComponent("crash_log.txt")
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let fullReport = "\n\n[\(timestamp)]\n\(report)\n"
        
        if let data = fullReport.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: crashLogPath.path) {
                if let fileHandle = try? FileHandle(forWritingTo: crashLogPath) {
                    fileHandle.seekToEndOfFile()
                    fileHandle.write(data)
                    fileHandle.closeFile()
                }
            } else {
                try? data.write(to: crashLogPath)
            }
        }
    }
    
    static func log(_ message: String, level: OSLogType = .info) {
        crashLogger.log(level: level, "\(message)")
        NSLog("📋 \(message)")
    }
}
