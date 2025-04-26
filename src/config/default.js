/**
 * 默认配置
 */
module.exports = {
  // 服务器信息
  server: {
    name: 'local-filesystem-server',
    version: '1.0.0'
  },
  
  // 日志配置
  logging: {
    level: 'info', // debug, info, warn, error
    enableConsole: true,
    enableFile: false,
    logFilePath: './logs/server.log',
    maxLogFileSize: 10 * 1024 * 1024, // 10MB
    maxLogFiles: 5
  },
  
  // 文件操作配置
  file: {
    maxReadSize: 50 * 1024 * 1024, // 50MB，最大一次性读取大小
    maxWriteSize: 50 * 1024 * 1024, // 50MB，最大一次性写入大小
    defaultEncoding: 'utf8',
    timeoutMs: 30000, // 30秒操作超时
    tempDir: './temp'
  },
  
  // 文件操作高级配置
  fileOperations: {
    // 缓存设置
    cache: {
      enabled: false,
      maxSize: 50 * 1024 * 1024, // 50MB
      maxAge: 60 * 1000 // 60秒
    },
    // 目录缓存设置
    dirCache: {
      enabled: false,
      maxSize: 100, // 最多缓存100个目录
      maxAge: 30 * 1000 // 30秒
    },
    // 缓存监控
    cacheMonitoring: {
      enabled: false,
      watchOptions: {
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100
        }
      }
    },
    // 流处理阈值
    streamThresholds: {
      read: 10 * 1024 * 1024, // 10MB
      write: 5 * 1024 * 1024,  // 5MB
      append: 5 * 1024 * 1024, // 5MB
      copy: 10 * 1024 * 1024   // 10MB
    },
    // 压缩配置
    compression: {
      defaultLevel: 6, // 默认压缩级别(0-9)
      threshold: 1024 * 1024 // 1MB以上文件才压缩
    }
  },
  
  // 工具配置
  tools: {
    enableAll: true, // 启用所有工具
    disabled: [] // 禁用的工具列表
  }
}; 