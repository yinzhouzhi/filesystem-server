// 文件操作配置
const fileOperations = {
  // 文件缓存配置
  fileCache: {
    enabled: true,          // 是否启用文件缓存
    maxSize: 100,           // 最大缓存文件数
    maxAge: 60000,          // 缓存有效期 (ms)
  },
  // 流处理阈值（字节）
  streamThresholds: {
    read: 10 * 1024 * 1024,  // 10MB以上使用流读取
    write: 5 * 1024 * 1024,  // 5MB以上使用流写入
    append: 1 * 1024 * 1024, // 1MB以上使用流追加
    copy: 10 * 1024 * 1024,  // 10MB以上使用流复制
  },
  // 压缩选项
  compression: {
    defaultLevel: 6,         // 默认压缩级别 (1-9)
    useForLogs: true,        // 是否为日志启用压缩
  },
  // 缓存监控配置
  cacheMonitoring: {
    enabled: true,           // 是否启用缓存监控
    watchOptions: {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    }
  }
};

// 监控池配置
const watchPool = {
  maxWatchers: 200,            // 最大监控器数量
  maxPerPath: 5,               // 每个路径的最大监控器数量
  maxPerProcess: 50,           // 每个进程的最大监控器数量
  cleanupInterval: 3600000,    // 清理间隔 (1小时)
  maxIdleTime: 7200000         // 最大闲置时间 (2小时)
};

module.exports = {
  fileOperations,
  watchPool
}; 