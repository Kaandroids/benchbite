// swift-tools-version:5.9
// The watch app's logic, tested on a Mac with `swift test` (#540). Its sources are links to the
// watch's own files that need no SwiftUI, WatchKit or WatchConnectivity; this folder has no
// expo-target.config, so the app is built without it.
import PackageDescription

let package = Package(
  name: "WatchTests",
  platforms: [.macOS(.v13)],
  targets: [
    .target(name: "WatchLogic", path: "Sources/WatchLogic"),
    .testTarget(
      name: "WatchLogicTests", dependencies: ["WatchLogic"], path: "Tests/WatchLogicTests"),
  ]
)
