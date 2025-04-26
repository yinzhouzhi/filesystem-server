/**
 * 日志工具模块
 * 提供不同级别的日志记录功能
 */
const fs = require('fs');
const path = require('path');
const util = require('util');
const zlib = require('zlib');
const { pipeline } = require('stream');

// 日志级别定义
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// 轮转类型定义
const ROTATION_TYPES = {
  SIZE: 'size',     // 按大小轮转
  DAILY: 'daily',   // 每日轮转
  WEEKLY: 'weekly', // 每周轮转
  MONTHLY: 'monthly' // 每月轮转
};

// 默认日志配置
const defaultConfig = {
  level: LOG_LEVELS.INFO,
  logToConsole: true,
  logToFile: true,
  logFilePath: path.join(process.cwd(), 'logs', 'filesystem-server.log'),
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
  rotateLogFiles: true,
  maxLogFiles: 5,
  compressRotatedLogs: true, // 压缩轮转的日志文件
  rotationType: ROTATION_TYPES.SIZE, // 默认按大小轮转
  format: 'text', // 'text' 或 'json'
  // 性能优化相关配置
  useBuffer: true,         // 使用缓冲区
  bufferSize: 64 * 1024,   // 缓冲区大小 (64KB)
  flushInterval: 1000,     // 缓冲区刷新间隔 (ms)
  asyncCompression: true,  // 异步压缩
  checkRotationInterval: 60000 // 日志轮转检查间隔 (ms)
};

let config = { ...defaultConfig };
let logFileStream = null;
let lastRotationCheck = Date.now();
let rotationTimer = null;
let logBuffer = '';         // 日志缓冲区
let bufferSize = 0;         // 当前缓冲区大小
let flushTimer = null;      // 缓冲区刷新定时器
let compressionQueue = [];  // 压缩队列
let processingCompression = false; // 是否正在处理压缩

/**
 * 初始化日志系统
 * @param {Object} options 日志配置
 */
function initialize(options = {}) {
  config = { ...defaultConfig, ...options };
  
  // 确保日志目录存在
  if (config.logToFile) {
    const logDir = path.dirname(config.logFilePath);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (error) {
        console.error(`无法创建日志目录: ${logDir}`, error.message);
        config.logToFile = false;
      }
    }
    
    // 如果已存在日志文件流，关闭它
    if (logFileStream) {
      logFileStream.end();
      logFileStream = null;
    }
    
    // 重置缓冲区
    logBuffer = '';
    bufferSize = 0;
    
    // 取消现有的刷新定时器
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    
    // 检查是否需要轮转日志
    if (config.rotateLogFiles) {
      checkRotation(true);
      
      // 设置定期检查日志轮转的定时器
      if (rotationTimer) {
        clearInterval(rotationTimer);
      }
      rotationTimer = setInterval(() => {
        checkRotation();
      }, config.checkRotationInterval);
    }
    
    // 创建日志文件流
    try {
      logFileStream = fs.createWriteStream(config.logFilePath, { flags: 'a' });
      
      // 设置缓冲区刷新定时器
      if (config.useBuffer && config.flushInterval > 0) {
        flushTimer = setInterval(() => {
          flushBuffer();
        }, config.flushInterval);
      }
    } catch (error) {
      console.error(`无法创建日志文件: ${config.logFilePath}`, error.message);
      config.logToFile = false;
    }
  }
  
  // 记录初始化信息
  info('日志系统初始化完成', { 
    level: getLevelName(config.level),
    logToConsole: config.logToConsole,
    logToFile: config.logToFile, 
    logFilePath: config.logFilePath,
    rotateLogFiles: config.rotateLogFiles,
    rotationType: config.rotationType,
    useBuffer: config.useBuffer,
    bufferSize: config.bufferSize,
    asyncCompression: config.asyncCompression
  });
}

/**
 * 刷新日志缓冲区
 */
function flushBuffer() {
  if (!config.logToFile || !logFileStream || bufferSize === 0) {
    return;
  }
  
  try {
    // 写入缓冲区内容
    logFileStream.write(logBuffer);
    
    // 重置缓冲区
    logBuffer = '';
    bufferSize = 0;
    
    // 检查是否需要轮转（仅在按大小轮转和刷新缓冲区时）
    if (config.rotateLogFiles && config.rotationType === ROTATION_TYPES.SIZE) {
      // 只有当距离上次检查已经过了指定间隔时间才进行检查
      const now = Date.now();
      if (now - lastRotationCheck >= 10000) { // 至少间隔10秒
        checkRotation();
      }
    }
  } catch (error) {
    console.error('刷新日志缓冲区失败', error.message);
    
    // 出错时尝试重新创建日志流
    try {
      if (logFileStream) {
        logFileStream.end();
      }
      logFileStream = fs.createWriteStream(config.logFilePath, { flags: 'a' });
    } catch (innerError) {
      console.error('重新创建日志流失败', innerError.message);
      config.logToFile = false;
    }
  }
}

/**
 * 检查是否需要轮转日志
 * @param {boolean} force 是否强制检查（忽略时间间隔限制）
 */
function checkRotation(force = false) {
  if (!config.rotateLogFiles || !fs.existsSync(config.logFilePath)) {
    return;
  }

  const now = Date.now();
  // 如果不是强制检查，且距离上次检查不足指定间隔，则跳过
  if (!force && now - lastRotationCheck < config.checkRotationInterval) {
    return;
  }
  
  lastRotationCheck = now;
  let shouldRotate = false;
  
  try {
    // 按大小轮转 - 使用stat获取文件大小，避免读取文件内容
    if (config.rotationType === ROTATION_TYPES.SIZE) {
      const stats = fs.statSync(config.logFilePath);
      shouldRotate = stats.size > config.maxLogFileSize;
    } 
    // 按时间轮转
    else {
      shouldRotate = shouldRotateByTime();
    }
    
    if (shouldRotate) {
      // 先刷新所有缓冲区内容
      flushBuffer();
      
      // 如果有活动的日志流，先关闭它
      if (logFileStream) {
        logFileStream.end();
        logFileStream = null;
      }
      
      // 执行轮转
      rotateLogFiles();
      
      // 重新创建日志流
      logFileStream = fs.createWriteStream(config.logFilePath, { flags: 'a' });
    }
  } catch (error) {
    console.error('检查日志轮转失败', error.message);
  }
}

/**
 * 根据时间策略判断是否应该轮转日志
 * @returns {boolean} 是否应该轮转
 */
function shouldRotateByTime() {
  if (!fs.existsSync(config.logFilePath)) {
    return false;
  }
  
  // 获取文件修改时间
  const stats = fs.statSync(config.logFilePath);
  const fileDate = new Date(stats.mtime);
  const now = new Date();
  
  // 按每日轮转
  if (config.rotationType === ROTATION_TYPES.DAILY) {
    return fileDate.getDate() !== now.getDate() || 
           fileDate.getMonth() !== now.getMonth() || 
           fileDate.getFullYear() !== now.getFullYear();
  } 
  // 按周轮转
  else if (config.rotationType === ROTATION_TYPES.WEEKLY) {
    // 获取一周中的第一天
    const getWeekStart = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整为从周一开始
      return new Date(d.setDate(diff));
    };
    
    const currentWeekStart = getWeekStart(now).getTime();
    const fileWeekStart = getWeekStart(fileDate).getTime();
    
    return currentWeekStart > fileWeekStart;
  } 
  // 按月轮转
  else if (config.rotationType === ROTATION_TYPES.MONTHLY) {
    return fileDate.getMonth() !== now.getMonth() || 
           fileDate.getFullYear() !== now.getFullYear();
  }
  
  return false;
}

/**
 * 轮转日志文件
 */
function rotateLogFiles() {
  try {
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')          // 替换冒号为连字符
      .replace(/\..+/, '')         // 移除毫秒部分
      .replace('T', '_');          // 替换T为下划线
    
    // 生成新的轮转文件名（带时间戳）
    const rotatedLogPath = `${config.logFilePath}.${timestamp}`;
    
    // 重命名当前日志文件
    if (fs.existsSync(config.logFilePath)) {
      fs.renameSync(config.logFilePath, rotatedLogPath);
    }
    
    // 如果配置了压缩，压缩轮转后的日志文件
    if (config.compressRotatedLogs) {
      if (config.asyncCompression) {
        // 异步压缩 - 添加到压缩队列
        compressionQueue.push(rotatedLogPath);
        // 如果没有压缩任务在进行，则启动处理
        if (!processingCompression) {
          processCompressionQueue();
        }
      } else {
        // 同步压缩
        compressLogFile(rotatedLogPath);
      }
    }
    
    // 删除超过maxLogFiles数量的日志文件
    cleanupOldLogFiles();
    
    info(`日志已轮转: ${path.basename(rotatedLogPath)}`);
  } catch (error) {
    console.error('轮转日志文件失败', error.message);
  }
}

/**
 * 处理压缩队列
 */
async function processCompressionQueue() {
  if (compressionQueue.length === 0) {
    processingCompression = false;
    return;
  }
  
  processingCompression = true;
  
  // 获取队列中的下一个文件
  const filePath = compressionQueue.shift();
  
  try {
    await compressLogFileAsync(filePath);
  } catch (error) {
    console.error(`压缩日志文件失败: ${filePath}`, error.message);
  }
  
  // 处理下一个文件
  setTimeout(() => {
    processCompressionQueue();
  }, 10);
}

/**
 * 异步压缩日志文件
 * @param {string} filePath 要压缩的文件路径
 * @returns {Promise} 压缩完成的Promise
 */
function compressLogFileAsync(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const gzippedPath = `${filePath}.gz`;
      
      // 创建文件流和gzip压缩流
      const readStream = fs.createReadStream(filePath);
      const writeStream = fs.createWriteStream(gzippedPath);
      const gzipStream = zlib.createGzip();
      
      // 使用pipeline进行流操作
      pipeline(
        readStream,
        gzipStream,
        writeStream,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // 压缩成功后，删除原文件
          fs.unlinkSync(filePath);
          debug(`日志文件已异步压缩: ${path.basename(gzippedPath)}`);
          resolve();
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 压缩指定的日志文件（同步方式）
 * @param {string} filePath 要压缩的文件路径
 */
function compressLogFile(filePath) {
  try {
    const gzippedPath = `${filePath}.gz`;
    
    // 创建文件流和gzip压缩流
    const readStream = fs.createReadStream(filePath);
    const writeStream = fs.createWriteStream(gzippedPath);
    const gzipStream = zlib.createGzip();
    
    // 使用pipeline进行流操作
    pipeline(
      readStream,
      gzipStream,
      writeStream,
      (err) => {
        if (err) {
          console.error(`压缩日志文件失败: ${filePath}`, err);
          return;
        }
        
        // 压缩成功后，删除原文件
        fs.unlinkSync(filePath);
        debug(`日志文件已压缩: ${path.basename(gzippedPath)}`);
      }
    );
  } catch (error) {
    console.error(`压缩日志文件失败: ${filePath}`, error.message);
  }
}

/**
 * 清理旧的日志文件
 */
function cleanupOldLogFiles() {
  try {
    // 获取日志目录
    const logDir = path.dirname(config.logFilePath);
    const baseFileName = path.basename(config.logFilePath);
    
    // 获取所有日志文件 - 使用异步操作读取目录内容
    fs.readdir(logDir, (err, files) => {
      if (err) {
        console.error('读取日志目录失败', err.message);
        return;
      }
      
      const logFiles = files
        .filter(file => 
          file.startsWith(baseFileName + '.') && 
          (file.endsWith('.gz') || !file.includes('.gz'))
        )
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          time: fs.statSync(path.join(logDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // 按时间从新到旧排序
      
      // 如果文件数超过最大值，删除最旧的文件
      if (logFiles.length > config.maxLogFiles) {
        logFiles.slice(config.maxLogFiles).forEach(file => {
          try {
            fs.unlinkSync(file.path);
            debug(`已删除旧日志文件: ${file.name}`);
          } catch (err) {
            console.error(`删除旧日志文件失败: ${file.path}`, err.message);
          }
        });
      }
    });
  } catch (error) {
    console.error('清理旧日志文件失败', error.message);
  }
}

/**
 * 获取日志级别名称
 * @param {number} level 日志级别
 * @returns {string} 日志级别名称
 */
function getLevelName(level) {
  return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'UNKNOWN';
}

/**
 * 格式化日志消息
 * @param {string} level 日志级别
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 * @returns {string} 格式化后的日志消息
 */
function formatLogMessage(level, message, data) {
  const timestamp = new Date().toISOString();
  
  if (config.format === 'json') {
    const logObject = {
      timestamp,
      level,
      message,
      ...data
    };
    return JSON.stringify(logObject);
  } else {
    let formattedData = '';
    if (data) {
      formattedData = util.inspect(data, { depth: 3, colors: false });
    }
    return `[${timestamp}] [${level}] ${message} ${formattedData}`;
  }
}

/**
 * 写入日志
 * @param {string} level 日志级别
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 */
function log(level, message, data = {}) {
  const levelValue = LOG_LEVELS[level];
  
  // 检查是否应该记录此级别的日志
  if (levelValue < config.level) {
    return;
  }
  
  const formattedMessage = formatLogMessage(level, message, data);
  
  // 控制台输出
  if (config.logToConsole) {
    if (level === 'ERROR') {
      console.error(formattedMessage);
    } else if (level === 'WARN') {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }
  
  // 文件输出
  if (config.logToFile && logFileStream) {
    const messageWithNewline = formattedMessage + '\n';
    
    if (config.useBuffer) {
      // 使用缓冲区
      logBuffer += messageWithNewline;
      bufferSize += messageWithNewline.length;
      
      // 如果缓冲区达到阈值，刷新缓冲区
      if (bufferSize >= config.bufferSize) {
        flushBuffer();
      }
    } else {
      // 直接写入文件
      logFileStream.write(messageWithNewline);
      
      // 检查是否需要轮转（仅在按大小轮转时）
      if (config.rotateLogFiles && config.rotationType === ROTATION_TYPES.SIZE) {
        checkRotation();
      }
    }
  }
}

/**
 * 记录调试级别日志
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 */
function debug(message, data = {}) {
  log('DEBUG', message, data);
}

/**
 * 记录信息级别日志
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 */
function info(message, data = {}) {
  log('INFO', message, data);
}

/**
 * 记录警告级别日志
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 */
function warn(message, data = {}) {
  log('WARN', message, data);
}

/**
 * 记录错误级别日志
 * @param {string} message 日志消息
 * @param {Object} data 附加数据
 */
function error(message, data = {}) {
  log('ERROR', message, data);
}

/**
 * 设置日志级别
 * @param {string} levelName 日志级别名称
 * @returns {boolean} 是否设置成功
 */
function setLevel(levelName) {
  const level = LOG_LEVELS[levelName.toUpperCase()];
  if (level !== undefined) {
    config.level = level;
    info(`日志级别已设置为 ${levelName.toUpperCase()}`);
    return true;
  }
  return false;
}

/**
 * 设置日志轮转类型
 * @param {string} type 轮转类型
 * @returns {boolean} 是否设置成功
 */
function setRotationType(type) {
  if (ROTATION_TYPES[type.toUpperCase()]) {
    config.rotationType = ROTATION_TYPES[type.toUpperCase()];
    info(`日志轮转类型已设置为 ${type.toUpperCase()}`);
    return true;
  }
  return false;
}

/**
 * 获取当前配置
 * @returns {Object} 当前日志配置
 */
function getConfig() {
  return { ...config };
}

/**
 * 关闭日志系统
 */
function shutdown() {
  info('日志系统关闭中');
  
  // 刷新缓冲区
  flushBuffer();
  
  // 清除定时器
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
  
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  
  // 关闭日志流
  if (logFileStream) {
    logFileStream.end();
    logFileStream = null;
  }
  
  // 确保处理完所有压缩任务
  if (compressionQueue.length > 0 && config.asyncCompression) {
    console.log(`等待 ${compressionQueue.length} 个日志文件压缩完成...`);
    // 不等待压缩完成，直接返回，让进程可以正常退出
  }
}

module.exports = {
  LOG_LEVELS,
  ROTATION_TYPES,
  initialize,
  debug,
  info,
  warn,
  error,
  setLevel,
  setRotationType,
  getConfig,
  shutdown
}; 