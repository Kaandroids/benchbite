Pod::Spec.new do |s|
  s.name           = 'WatchLink'
  s.version        = '1.0.0'
  s.summary        = 'Talks to Benchbite on the Apple Watch'
  s.description    = 'Carries the protocol of ADR 0109 between the phone and the watch over WatchConnectivity.'
  s.license        = 'MIT'
  s.author         = 'Benchbite'
  s.homepage       = 'https://www.benchbite.com'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Kaandroids/benchbite.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
