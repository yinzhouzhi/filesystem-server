/**
 * 文件操作工具模块
 * 实现文件的读写、删除、复制、移动等操作
 */
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const logger = require('../utils/logging');
const pathUtils = require('../utils/path-utils');
const streamUtils = require('../utils/stream-utils');
const securityUtils = require('../config/security');
const config = require('../config');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const watchTools = require('./watch-tools');

// 将回调API转换为Promise
const fsCopyFile = promisify(fs.copyFile);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);

// 文件缓存配置
const FILE_CACHE = {
  enabled: false,         // 默认禁用缓存
  items: new Map(),       // 缓存项
  size: 0,                // 当前缓存大小
  maxSize: 50 * 1024 * 1024, // 最大缓存大小 (50MB)
  maxAge: 60 * 1000,      // 缓存项最大存活时间 (60秒)
  hits: 0,                // 缓存命中次数
  misses: 0,              // 缓存未命中次数
  evictions: 0,           // 缓存项被清除次数
  monitoring: {
    enabled: false,       // 默认禁用缓存监控
    watchers: new Map(),  // 文件监控器
    monitoredPaths: new Set() // 已监控的路径
  }
};

// 文件缓存监控状态
const CACHE_MONITORS = {
  enabled: config?.fileOperations?.cacheMonitoring?.enabled || false,
  watchers: new Map(),
  monitoredPaths: new Set()
};

// 大文件的阈值
const LARGE_FILE_THRESHOLD = {
  read: 10 * 1024 * 1024,  // 10MB
  write: 5 * 1024 * 1024   // 5MB
};

/**
 * 初始化缓存监控
 */
function initCacheMonitoring() {
  if (CACHE_MONITORS.enabled) return; // 已初始化
  
  CACHE_MONITORS.enabled = true;
  logger.info('初始化文件缓存监控系统');
  
  // 当进程退出时清理所有监控
  process.on('exit', () => {
    // 关闭所有监控器
    for (const watcher of CACHE_MONITORS.watchers.values()) {
      if (watcher && typeof watcher.close === 'function') {
        watcher.close();
      }
    }
  });
}

/**
 * 为缓存的文件添加监控
 * @param {string} filePath 文件路径
 */
function monitorFileForCache(filePath) {
  if (!FILE_CACHE.enabled || !config?.fileOperations?.cacheMonitoring?.enabled) {
    return;
  }
  
  if (!CACHE_MONITORS.enabled) {
    initCacheMonitoring();
  }
  
  // 已监控的路径不重复添加
  if (CACHE_MONITORS.monitoredPaths.has(filePath)) {
    return;
  }
  
  try {
    // 监控配置选项
    const watchOptions = config?.fileOperations?.cacheMonitoring?.watchOptions || {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    };
    
    // 创建监控并设置回调
    const watcher = watchTools.setFileChangeCallback(
      filePath, 
      (event, changedPath) => {
        if (event === 'change' || event === 'unlink') {
          // 文件被修改或删除，从缓存中移除
          if (FILE_CACHE.items.has(filePath)) {
            logger.debug(`文件变更，从缓存移除: ${filePath}, 事件: ${event}`);
            FILE_CACHE.items.delete(filePath);
            
            // 同时通知任何依赖该文件的目录缓存
            const dirPath = path.dirname(filePath);
            try {
              // 导入目录工具模块（避免循环依赖）
              const dirTools = require('./dir-tools');
              if (typeof dirTools.invalidateDirCache === 'function') {
                dirTools.invalidateDirCache(dirPath);
              }
            } catch (err) {
              // 忽略错误
            }
          }
        }
      },
      watchOptions
    );
    
    if (watcher) {
      // 保存监控器引用
      CACHE_MONITORS.watchers.set(filePath, watcher);
      CACHE_MONITORS.monitoredPaths.add(filePath);
      
      logger.debug(`已添加文件缓存监控: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`添加文件缓存监控失败: ${filePath}`, { error });
  }
}

/**
 * 停止文件缓存监控
 * @param {string} filePath 文件路径
 */
function stopMonitoringFile(filePath) {
  if (!CACHE_MONITORS.enabled || !CACHE_MONITORS.monitoredPaths.has(filePath)) {
    return;
  }
  
  try {
    const watcher = CACHE_MONITORS.watchers.get(filePath);
    if (watcher) {
      // 使用watchTools的closeWatcher函数关闭监控器
      watchTools.closeWatcher(watcher);
      CACHE_MONITORS.watchers.delete(filePath);
      CACHE_MONITORS.monitoredPaths.delete(filePath);
      logger.debug(`已停止文件缓存监控: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`停止文件缓存监控失败: ${filePath}`, { error });
  }
}

/**
 * 清理所有文件监控器
 */
function clearAllFileMonitors() {
  try {
    // 关闭所有监控器
    for (const [filePath, watcher] of FILE_CACHE.monitoring.watchers.entries()) {
      try {
        watcher.close();
        logger.debug(`清理文件监控器: ${filePath}`);
      } catch (err) {
        logger.error(`关闭文件监控器失败: ${filePath}`, { error: err });
      }
    }
    
    // 清空集合
    FILE_CACHE.monitoring.watchers.clear();
    FILE_CACHE.monitoring.monitoredPaths.clear();
    
    logger.info(`已清理所有文件缓存监控器: ${FILE_CACHE.monitoring.watchers.size}`);
  } catch (error) {
    logger.error('清理文件监控器失败', { error });
  }
}

/**
 * 读取文件内容
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @param {string} params.encoding 编码方式，默认utf-8
 * @returns {Promise<string>} 文件内容
 */
async function readFile(params) {
  const { path: filePath, encoding = 'utf8' } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('read_file', params)) {
    throw new Error('没有权限读取文件');
  }
  
  try {
    // 检查路径是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `文件不存在: ${filePath}` };
    }

    // 检查缓存
    if (FILE_CACHE.enabled) {
      const cachedContent = getFromCache(filePath);
      if (cachedContent) {
        FILE_CACHE.hits++;
        return { success: true, content: cachedContent, encoding };
      }
      FILE_CACHE.misses++;
    }

    // 获取文件状态
    const stats = fs.statSync(filePath);
    
    // 检查文件大小，大文件使用流处理
    if (stats.size > (config?.fileOperations?.streamThresholds?.read || LARGE_FILE_THRESHOLD.read)) {
      return readLargeFile(filePath, encoding);
    }
    
    // 读取文件内容
    const content = fs.readFileSync(filePath, encoding);
    
    // 添加到缓存
    if (FILE_CACHE.enabled && stats.size < 1024 * 1024) { // 只缓存1MB以下的文件
      addToCache(filePath, content);
    }
    
    return { success: true, content, encoding };
  } catch (error) {
    logger.error(`读取文件失败: ${error.message}`, { path: filePath, error });
    return { success: false, error: error.message };
  }
}

// 使用流读取大文件
function readLargeFile(filePath, encoding) {
  try {
    // 创建可读流
    const readStream = fs.createReadStream(filePath, { encoding });
    
    // 收集数据
    let content = '';
    
    return new Promise((resolve) => {
      readStream.on('data', (chunk) => {
        content += chunk;
      });
      
      readStream.on('end', () => {
        resolve({ success: true, content, encoding, streamed: true });
      });
      
      readStream.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 写入文件内容
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @param {string} params.content 文件内容
 * @param {string} params.encoding 编码方式，默认utf-8
 * @returns {Promise<Object>} 写入结果
 */
async function writeFile(params) {
  const { path: filePath, content, encoding = 'utf8' } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('write_file', params)) {
    throw new Error('没有权限写入文件');
  }
  
  try {
    // 确保目标目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 检查文件内容大小，大文件使用流处理
    if (content.length > (config?.fileOperations?.streamThresholds?.write || LARGE_FILE_THRESHOLD.write)) {
      return writeLargeFile(filePath, content, encoding);
    }
    
    // 写入文件内容
    fs.writeFileSync(filePath, content, encoding);
    
    // 如果内容在缓存中，更新缓存
    if (FILE_CACHE.enabled && FILE_CACHE.items.has(filePath)) {
      addToCache(filePath, content);
    }
    
    return { success: true, path: filePath };
  } catch (error) {
    logger.error(`写入文件失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

// 使用流写入大文件
function writeLargeFile(filePath, content, encoding) {
  return new Promise((resolve) => {
    try {
      // 创建可写流
      const writeStream = fs.createWriteStream(filePath, { encoding });
      
      // 写入数据
      writeStream.write(content);
      writeStream.end();
      
      writeStream.on('finish', () => {
        resolve({ success: true, path: filePath, streamed: true });
      });
      
      writeStream.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 追加内容到文件
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @param {string} params.content 追加的内容
 * @param {string} params.encoding 编码方式，默认utf-8
 * @returns {Promise<Object>} 追加结果
 */
async function appendFile(params) {
  const { path: filePath, content, encoding = 'utf8' } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('append_file', params)) {
    throw new Error('没有权限追加文件内容');
  }
  
  try {
    // 确保目标目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 检查文件内容大小，大文件使用流处理
    if (content.length > (config?.fileOperations?.streamThresholds?.append || LARGE_FILE_THRESHOLD.write)) {
      return appendLargeFile(filePath, content, encoding);
    }
    
    // 追加文件内容
    fs.appendFileSync(filePath, content, encoding);
    
    // 如果内容在缓存中，移除缓存
    if (FILE_CACHE.enabled && FILE_CACHE.items.has(filePath)) {
      FILE_CACHE.items.delete(filePath);
    }
    
    return { success: true, path: filePath };
  } catch (error) {
    logger.error(`追加文件内容失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

// 使用流追加大文件
function appendLargeFile(filePath, content, encoding) {
  return new Promise((resolve) => {
    try {
      // 创建可写流
      const writeStream = fs.createWriteStream(filePath, { 
        encoding,
        flags: 'a'
      });
      
      // 写入数据
      writeStream.write(content);
      writeStream.end();
      
      writeStream.on('finish', () => {
        resolve({ success: true, path: filePath, streamed: true });
      });
      
      writeStream.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * 删除文件
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @returns {Promise<Object>} 删除结果
 */
async function deleteFile(params) {
  const { path: filePath } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('delete_file', params)) {
    throw new Error('没有权限删除文件');
  }
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: true, deleted: false, path: filePath };
    }
    
    // 删除文件
    logger.info(`删除文件: ${filePath}`);
    fs.unlinkSync(filePath);
    
    // 从缓存中删除
    if (FILE_CACHE.enabled && FILE_CACHE.items.has(filePath)) {
      FILE_CACHE.items.delete(filePath);
    }
    
    return { success: true, deleted: true, path: filePath };
  } catch (error) {
    logger.error(`删除文件失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

/**
 * 复制文件
 * @param {Object} params 参数
 * @param {string} params.source 源文件路径
 * @param {string} params.destination 目标文件路径
 * @param {boolean} params.overwrite 是否覆盖目标文件，默认false
 * @returns {Promise<Object>} 复制结果
 */
async function copyFile(params) {
  const { source, destination, overwrite = false } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('copy_file', params)) {
    throw new Error('没有权限复制文件');
  }
  
  try {
    // 检查源文件是否存在
    if (!fs.existsSync(source)) {
      return { success: false, error: `源文件不存在: ${source}` };
    }
    
    // 确保目标目录存在
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // 获取文件状态
    const stats = fs.statSync(source);
    
    // 检查文件大小，大文件使用流处理
    if (stats.size > (config?.fileOperations?.streamThresholds?.copy || LARGE_FILE_THRESHOLD.read)) {
      return copyLargeFile(source, destination, overwrite);
    }

    // 使用标准 fs.copyFile 复制文件
    let copyFlag = 0;
    if (!overwrite) {
      copyFlag = fs.constants.COPYFILE_EXCL;
    }

    await fsCopyFile(source, destination, copyFlag);
    return { success: true, source, destination };
  } catch (error) {
    // 处理特定错误：文件已存在
    if (error.code === 'EEXIST') {
      return { 
        success: false, 
        error: `目标文件已存在: ${destination}。如需覆盖，请设置 overwrite 为 true` 
      };
    }
    logger.error(`复制文件失败: ${error.message}`, { source, destination, error });
    return { success: false, error: error.message };
  }
}

// 使用流复制大文件
async function copyLargeFile(source, destination, overwrite) {
  try {
    // 检查目标文件是否已存在
    if (!overwrite && fs.existsSync(destination)) {
      return { 
        success: false, 
        error: `目标文件已存在: ${destination}。如需覆盖，请设置 overwrite 为 true` 
      };
    }
    
    // 创建目标文件的写入流
    const writeStream = fs.createWriteStream(destination);
    
    // 使用pipeline进行流复制
    await pipeline(
      fs.createReadStream(source),
      writeStream
    );
    
    return { 
      success: true, 
      source, 
      destination,
      streamed: true
    };
  } catch (error) {
    logger.error(`大文件复制失败: ${error.message}`, { source, destination, error });
    return { success: false, error: error.message };
  }
}

// 移动文件
async function moveFile(params) {
  const { source, destination } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('move_file', params)) {
    throw new Error('没有权限移动文件');
  }
  
  try {
    // 尝试使用重命名（通常更快，但只在同一文件系统上工作）
    try {
      // 检查目标文件是否已存在
      if (fs.existsSync(destination)) {
        return { 
          success: false, 
          error: `目标文件已存在，未指定覆盖: ${destination}` 
        };
      }
      
      // 确保目标目录存在
      const dir = path.dirname(destination);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 尝试直接重命名
      fs.renameSync(source, destination);
      
      // 更新缓存
      if (FILE_CACHE.enabled) {
        if (FILE_CACHE.items.has(source)) {
          const item = FILE_CACHE.items.get(source);
          FILE_CACHE.items.set(destination, item);
          FILE_CACHE.items.delete(source);
        }
      }
      
      return { success: true, source, destination };
    } catch (renameError) {
      // 在不同文件系统上可能失败，尝试复制然后删除
      const copyResult = await copyFile({ 
        source, 
        destination, 
        overwrite: true 
      });
      
      if (copyResult.success) {
        fs.unlinkSync(source);
        
        // 更新缓存
        if (FILE_CACHE.enabled && FILE_CACHE.items.has(source)) {
          FILE_CACHE.items.delete(source);
        }
        
        return { 
          success: true, 
          source, 
          destination,
          method: 'copy-delete'
        };
      } else {
        return copyResult;
      }
    }
  } catch (error) {
    logger.error(`移动文件失败: ${error.message}`, { source, destination, error });
    throw error;
  }
}

/**
 * 获取文件信息
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @returns {Promise<Object>} 文件信息
 */
async function getFileInfo(params) {
  const { path: filePath } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('get_file_info', params)) {
    throw new Error('没有权限获取文件信息');
  }
  
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: true, path: filePath, exists: false };
    }
    
    // 获取文件信息
    const stats = fs.statSync(filePath);
    
    logger.info(`获取文件信息: ${filePath}`);
    
    return {
      success: true,
      path: filePath,
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      permissions: stats.mode,
      inCache: FILE_CACHE.enabled && FILE_CACHE.items.has(filePath)
    };
  } catch (error) {
    logger.error(`获取文件信息失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

/**
 * 检查文件是否存在
 * @param {Object} params 参数
 * @param {string} params.path 文件路径
 * @returns {Promise<Object>} 检查结果
 */
async function fileExists(params) {
  const { path: filePath } = params;
  
  // 检查权限
  if (!securityUtils.validateToolCall('file_exists', params)) {
    throw new Error('没有权限检查文件存在');
  }
  
  try {
    // 检查路径是否存在
    let exists = false;
    let isFile = false;
    try {
      const stats = fs.statSync(filePath);
      exists = true;
      isFile = stats.isFile();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 文件不存在，继续
    }
    
    logger.info(`检查文件存在: ${filePath} => ${exists && isFile}`);
    
    return {
      success: true,
      path: filePath,
      exists: exists && isFile
    };
  } catch (error) {
    logger.error(`检查文件存在失败: ${error.message}`, { path: filePath, error });
    throw error;
  }
}

// 从缓存获取文件内容
function getFromCache(filePath) {
  if (!FILE_CACHE.enabled) {
    return null;
  }
  
  const cacheItem = FILE_CACHE.items.get(filePath);
  if (!cacheItem) {
    FILE_CACHE.misses++;
    return null;
  }
  
  // 检查缓存项是否过期
  if (Date.now() - cacheItem.timestamp > FILE_CACHE.maxAge) {
    // 过期了，从缓存中移除
    logger.debug(`缓存项过期: ${filePath}`);
    if (FILE_CACHE.monitoring.enabled) {
      stopMonitoringFile(filePath);
    }
    FILE_CACHE.items.delete(filePath);
    FILE_CACHE.size -= cacheItem.content.length;
    FILE_CACHE.evictions++;
    return null;
  }
  
  // 缓存命中
  FILE_CACHE.hits++;
  // 更新访问时间
  cacheItem.lastAccess = Date.now();
  
  return cacheItem.content;
}

// 添加文件内容到缓存
function addToCache(filePath, content) {
  if (!FILE_CACHE.enabled || !content) {
    return;
  }
  
  // 如果内容太大，不缓存
  if (content.length > LARGE_FILE_THRESHOLD.read) {
    logger.debug(`文件太大，不缓存: ${filePath} (${content.length} bytes)`);
    return;
  }
  
  const cacheItem = {
    content,
    timestamp: Date.now(),
    lastAccess: Date.now()
  };
  
  // 已经在缓存中，更新内容
  if (FILE_CACHE.items.has(filePath)) {
    const oldItem = FILE_CACHE.items.get(filePath);
    FILE_CACHE.size -= oldItem.content.length;
  }
  
  // 尝试进行缓存清理，确保有足够空间
  ensureCacheSpace(content.length);
  
  // 添加到缓存
  FILE_CACHE.items.set(filePath, cacheItem);
  FILE_CACHE.size += content.length;
  
  // 如果启用了监控，为文件设置监控
  if (FILE_CACHE.monitoring.enabled) {
    monitorFileForCache(filePath);
  }
  
  logger.debug(`文件已缓存: ${filePath} (${content.length} bytes)`);
}

// 确保缓存有足够空间
function ensureCacheSpace(requiredSpace) {
  if (FILE_CACHE.size + requiredSpace <= FILE_CACHE.maxSize) {
    return; // 空间足够
  }
  
  // 按最后访问时间排序
  const cacheItems = Array.from(FILE_CACHE.items.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  
  // 从最久未访问的开始删除
  for (const [key, item] of cacheItems) {
    if (FILE_CACHE.monitoring.enabled) {
      stopMonitoringFile(key);
    }
    FILE_CACHE.items.delete(key);
    FILE_CACHE.size -= item.content.length;
    FILE_CACHE.evictions++;
    
    logger.debug(`缓存清理: ${key} (${item.content.length} bytes)`);
    
    // 检查是否已经有足够空间
    if (FILE_CACHE.size + requiredSpace <= FILE_CACHE.maxSize) {
      break;
    }
  }
}

// 清理缓存
function clearCache() {
  // 停止所有文件监控
  for (const filePath of CACHE_MONITORS.monitoredPaths) {
    stopMonitoringFile(filePath);
  }
  
  FILE_CACHE.items.clear();
  FILE_CACHE.size = 0;
  return { 
    success: true, 
    message: '文件缓存已清理',
    stats: {
      enabled: FILE_CACHE.enabled,
      monitoringEnabled: FILE_CACHE.monitoring.enabled,
      itemCount: FILE_CACHE.items.size,
      size: FILE_CACHE.size,
      maxSize: FILE_CACHE.maxSize,
      maxAge: FILE_CACHE.maxAge,
      hits: FILE_CACHE.hits,
      misses: FILE_CACHE.misses,
      evictions: FILE_CACHE.evictions,
      monitoredFiles: FILE_CACHE.monitoring.monitoredPaths.size
    }
  };
}

/**
 * 获取缓存统计信息
 * @returns {Object} 缓存统计信息
 */
function getCacheStats() {
  return {
    enabled: FILE_CACHE.enabled,
    size: FILE_CACHE.items.size,
    maxSize: FILE_CACHE.maxSize,
    maxAge: FILE_CACHE.maxAge,
    monitoring: {
      enabled: CACHE_MONITORS.enabled,
      count: CACHE_MONITORS.monitoredPaths.size
    },
    stats: {
      hits: FILE_CACHE.hits,
      misses: FILE_CACHE.misses,
      evictions: FILE_CACHE.evictions
    }
  };
}

// 文件压缩操作
async function compressFile({ source, destination, level = config?.fileOperations?.compression?.defaultLevel || 6 }) {
  try {
    // 检查源文件是否存在
    if (!fs.existsSync(source)) {
      return { success: false, error: `源文件不存在: ${source}` };
    }
    
    // 如果未指定目标文件，默认添加.gz后缀
    if (!destination) {
      destination = `${source}.gz`;
    }
    
    // 确保目标目录存在
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    try {
      // 使用管道流压缩
      await pipeline(
        fs.createReadStream(source),
        zlib.createGzip({ level }),
        fs.createWriteStream(destination)
      );
      
      return { 
        success: true, 
        source, 
        destination 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 文件解压操作
async function decompressFile({ source, destination }) {
  try {
    // 检查源文件是否存在
    if (!fs.existsSync(source)) {
      return { success: false, error: `源文件不存在: ${source}` };
    }
    
    // 如果未指定目标文件，默认去除.gz后缀
    if (!destination) {
      if (source.endsWith('.gz')) {
        destination = source.slice(0, -3);
      } else {
        destination = `${source}.uncompressed`;
      }
    }
    
    // 确保目标目录存在
    const dir = path.dirname(destination);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    try {
      // 使用管道流解压
      await pipeline(
        fs.createReadStream(source),
        zlib.createGunzip(),
        fs.createWriteStream(destination)
      );
      
      return { 
        success: true, 
        source, 
        destination 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  readFile,
  writeFile,
  appendFile,
  deleteFile,
  copyFile,
  moveFile,
  getFileInfo,
  fileExists,
  getCacheStats,
  clearCache,
  compressFile,
  decompressFile,
  monitorFileForCache,
  stopMonitoringFile,
  setConfig: function(config) {
    if (config.hasOwnProperty('cacheEnabled')) {
      FILE_CACHE.enabled = !!config.cacheEnabled;
      
      // 如果禁用缓存，清理所有监控
      if (!FILE_CACHE.enabled) {
        clearCache();
      }
    }
    if (config.maxCacheSize && typeof config.maxCacheSize === 'number') {
      FILE_CACHE.maxSize = config.maxCacheSize;
    }
    if (config.maxCacheAge && typeof config.maxCacheAge === 'number') {
      FILE_CACHE.maxAge = config.maxCacheAge;
    }
    if (config.hasOwnProperty('monitoringEnabled')) {
      FILE_CACHE.monitoring.enabled = !!config.monitoringEnabled;
      
      // 如果禁用监控，清理所有监控
      if (!FILE_CACHE.monitoring.enabled) {
        clearAllFileMonitors();
      } else if (FILE_CACHE.enabled) {
        // 如果启用监控，为所有缓存项添加监控
        for (const filePath of FILE_CACHE.items.keys()) {
          monitorFileForCache(filePath);
        }
      }
    }
    return { 
      success: true, 
      message: '文件工具配置已更新',
      config: {
        cacheEnabled: FILE_CACHE.enabled,
        maxCacheSize: FILE_CACHE.maxSize,
        maxCacheAge: FILE_CACHE.maxAge,
        monitoringEnabled: FILE_CACHE.monitoring.enabled
      }
    };
  }
}; 