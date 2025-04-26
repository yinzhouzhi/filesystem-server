/**
 * 目录操作工具模块
 * 实现目录的创建、删除、列表等操作
 */
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const logger = require('../utils/logging');
const pathUtils = require('../utils/path-utils');
const securityUtils = require('../config/security');
const config = require('../config');
const watchTools = require('./watch-tools');

// 将回调API转换为Promise
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);

// 目录缓存配置
const DIR_CACHE = {
  enabled: config?.fileOperations?.dirCache?.enabled || false,
  maxSize: config?.fileOperations?.dirCache?.maxSize || 100,
  maxAge: config?.fileOperations?.dirCache?.maxAge || 30000,
  items: new Map(),
  stats: {
    hits: 0,
    misses: 0,
    evictions: 0
  }
};

// 目录缓存监控状态
const DIR_MONITORS = {
  enabled: config?.fileOperations?.cacheMonitoring?.enabled || false,
  watchers: new Map(),
  monitoredPaths: new Set()
};

/**
 * 初始化目录缓存监控
 */
function initDirCacheMonitoring() {
  if (DIR_MONITORS.enabled) return; // 已初始化
  
  DIR_MONITORS.enabled = true;
  logger.info('初始化目录缓存监控系统');
  
  // 当进程退出时清理所有监控
  process.on('exit', () => {
    // 关闭所有监控器
    for (const watcher of DIR_MONITORS.watchers.values()) {
      if (watcher && typeof watcher.close === 'function') {
        watcher.close();
      }
    }
  });
}

/**
 * 为缓存的目录添加监控
 * @param {string} dirPath 目录路径
 */
function monitorDirectoryForCache(dirPath) {
  if (!DIR_CACHE.enabled || !config?.fileOperations?.cacheMonitoring?.enabled) {
    return;
  }
  
  if (!DIR_MONITORS.enabled) {
    initDirCacheMonitoring();
  }
  
  // 已监控的路径不重复添加
  if (DIR_MONITORS.monitoredPaths.has(dirPath)) {
    return;
  }
  
  try {
    // 监控配置选项
    const watchOptions = config?.fileOperations?.cacheMonitoring?.watchOptions || {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    };
    
    // 启用递归监控
    watchOptions.recursive = true;
    
    // 创建监控并设置回调
    const watcher = watchTools.setDirChangeCallback(
      dirPath, 
      (event, changedPath) => {
        // 任何目录变更都会使该目录的缓存失效
        invalidateDirCache(dirPath);
    
        // 对于子目录的变化，也使相应的子目录缓存失效
        if (changedPath && changedPath !== dirPath) {
          const relativePath = path.relative(dirPath, changedPath);
          if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
            // 文件在监控的目录内
            const parentDir = path.dirname(changedPath);
            if (parentDir !== dirPath) {
              // 如果更改的是子目录中的文件，那么也使该子目录的缓存失效
              invalidateDirCache(parentDir);
            }
          }
        }
      },
      watchOptions
    );
    
    if (watcher) {
      // 保存监控器引用
      DIR_MONITORS.watchers.set(dirPath, watcher);
      DIR_MONITORS.monitoredPaths.add(dirPath);
      
      logger.debug(`已添加目录缓存监控: ${dirPath}`);
    }
  } catch (error) {
    logger.warn(`添加目录缓存监控失败: ${dirPath}`, { error });
  }
}

/**
 * 停止目录缓存监控
 * @param {string} dirPath 目录路径
 */
function stopMonitoringDirectory(dirPath) {
  if (!DIR_MONITORS.enabled || !DIR_MONITORS.monitoredPaths.has(dirPath)) {
    return;
  }
  
  try {
    const watcher = DIR_MONITORS.watchers.get(dirPath);
    if (watcher) {
      // 使用watchTools的closeWatcher函数关闭监控器
      watchTools.closeWatcher(watcher);
      DIR_MONITORS.watchers.delete(dirPath);
      DIR_MONITORS.monitoredPaths.delete(dirPath);
      logger.debug(`已停止目录缓存监控: ${dirPath}`);
    }
  } catch (error) {
    logger.warn(`停止目录缓存监控失败: ${dirPath}`, { error });
  }
}

/**
 * 创建目录
 * @param {string} dirPath 目录路径
 * @param {object} options 选项
 * @returns {Promise<object>} 结果
 */
async function createDirectory(dirPath, options = {}) {
  const defaultOptions = { recursive: true };
  options = { ...defaultOptions, ...options };
  
  try {
    // 验证路径
    dirPath = pathUtils.sanitizePath(dirPath);
    if (!await securityUtils.isPathAllowed(dirPath)) {
      return { success: false, message: '路径访问被拒绝', code: 'ACCESS_DENIED' };
    }
    
    // 检查目录是否已存在
    const exists = await directoryExists(dirPath);
    if (exists.success && exists.exists) {
      return { success: true, message: '目录已存在', code: 'ALREADY_EXISTS' };
    }
    
    // 创建目录
    await mkdir(dirPath, { recursive: options.recursive });
    
    // 使父目录的缓存失效，因为新建了子目录
    const parentDir = path.dirname(dirPath);
    invalidateDirCache(parentDir);
    
    return { success: true, message: '目录创建成功' };
  } catch (error) {
    logger.error(`创建目录失败: ${dirPath}`, { error });
    return { success: false, message: `创建目录失败: ${error.message}`, error };
  }
}

/**
 * 删除目录
 * @param {string} dirPath 目录路径
 * @param {object} options 选项
 * @returns {Promise<object>} 结果
 */
async function deleteDirectory(dirPath, options = {}) {
  const defaultOptions = { recursive: false, force: false };
  options = { ...defaultOptions, ...options };
  
  try {
    // 验证路径
    dirPath = pathUtils.sanitizePath(dirPath);
    if (!await securityUtils.isPathAllowed(dirPath)) {
      return { success: false, message: '路径访问被拒绝', code: 'ACCESS_DENIED' };
    }
    
    // 检查目录是否存在
    const exists = await directoryExists(dirPath);
    if (!exists.success || !exists.exists) {
      return { success: false, message: '目录不存在', code: 'NOT_FOUND' };
    }
    
    // 如果使用递归删除
    if (options.recursive) {
      // 这里我们使用Node.js内置的fs.rmdir或第三方库如fs-extra
      if (options.force) {
        // 使用fs-extra提供的更强大的移除功能
        // 需要先检查是否安装了fs-extra
        try {
          const fsExtra = require('fs-extra');
          await fsExtra.remove(dirPath);
        } catch (moduleError) {
          // 如果没有fs-extra，退回到递归删除
          await rmdir(dirPath, { recursive: true });
        }
      } else {
        await rmdir(dirPath, { recursive: true });
      }
    } else {
      // 非递归删除只有在目录为空时才能成功
      await rmdir(dirPath);
    }
    
    // 使目录和父目录的缓存失效
    invalidateDirCache(dirPath);
    const parentDir = path.dirname(dirPath);
    invalidateDirCache(parentDir);
    
    // 停止监控已删除的目录
    stopMonitoringDirectory(dirPath);
    
    return { success: true, message: '目录删除成功' };
  } catch (error) {
    logger.error(`删除目录失败: ${dirPath}`, { error });
    return { success: false, message: `删除目录失败: ${error.message}`, error };
  }
}

/**
 * 列出目录内容
 * @param {string} dirPath 目录路径
 * @param {object} options 选项
 * @returns {Promise<object>} 目录内容
 */
async function listFiles(dirPath, options = {}) {
  const defaultOptions = { recursive: false };
  options = { ...defaultOptions, ...options };

  try {
    // 验证路径
    dirPath = pathUtils.sanitizePath(dirPath);
    if (!await securityUtils.isPathAllowed(dirPath)) {
      return { success: false, message: '路径访问被拒绝', code: 'ACCESS_DENIED' };
    }
    
    // 检查缓存
    const cachedResult = getFromDirCache(dirPath);
    if (cachedResult && !options.recursive) { // 只缓存非递归结果
      return { success: true, data: cachedResult };
    }
    
    DIR_CACHE.stats.misses++;
    
    // 检查目录是否存在
    const exists = await directoryExists(dirPath);
    if (!exists.success || !exists.exists) {
      return { success: false, message: '目录不存在', code: 'NOT_FOUND' };
    }
    
    const result = [];
    
    // 读取目录内容
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const itemPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(dirPath, itemPath);
      
      // 创建基本信息对象
      const itemInfo = {
        name: entry.name,
        path: itemPath,
        relativePath: relativePath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink()
      };
      
      // 如果是目录且需要递归，则递归获取内容
      if (entry.isDirectory() && options.recursive) {
        const subDirContent = await listFiles(itemPath, options);
        if (subDirContent.success) {
          itemInfo.children = subDirContent.data;
        }
      }
      
      // 尝试获取详细信息
      try {
        const stats = await stat(itemPath);
        itemInfo.size = stats.size;
        itemInfo.createdAt = stats.birthtime;
        itemInfo.modifiedAt = stats.mtime;
        itemInfo.accessedAt = stats.atime;
      } catch (error) {
        // 忽略无法获取详细信息的错误
        logger.debug(`无法获取文件详细信息: ${itemPath}`, { error: error.message });
      }
      
      result.push(itemInfo);
    }
    
    // 如果不是递归调用则缓存结果
    if (!options.recursive) {
      addToDirCache(dirPath, result);
    }
    
    return { success: true, data: result };
  } catch (error) {
    logger.error(`列出目录内容失败: ${dirPath}`, { error });
    return { success: false, message: `列出目录内容失败: ${error.message}`, error };
  }
}

/**
 * 检查目录是否存在
 * @param {Object|string} params 参数或目录路径字符串
 * @returns {Promise<Object>} 检查结果
 */
async function directoryExists(params) {
  let dirPath = '';
  
  // 处理不同类型的参数
  if (typeof params === 'string') {
    dirPath = params;
  } else if (params && typeof params === 'object' && params.path) {
    dirPath = params.path;
  } else if (!params) {
    return { 
      success: false, 
      error: '目录路径参数不能为空' 
    };
  }
  
  // 确保路径是字符串类型
  if (typeof dirPath !== 'string') {
    return { 
      success: false, 
      error: '目录路径必须是字符串类型',
      path: dirPath
    };
  }
  
  try {
    // 检查路径是否存在
    let exists = false;
    let isDirectory = false;
    
    try {
      const stats = fs.statSync(dirPath);
      exists = true;
      isDirectory = stats.isDirectory();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 目录不存在，继续
    }
    
    logger.info(`检查目录存在: ${dirPath} => ${exists && isDirectory}`);
    
    return {
      success: true,
      path: dirPath,
      exists: exists && isDirectory
    };
  } catch (error) {
    logger.error(`检查目录存在失败: ${error.message}`, { path: dirPath, error });
    return { success: false, error: error.message };
  }
}

/**
 * 获取目录信息
 * @param {Object|string} params 参数或目录路径字符串
 * @returns {Promise<Object>} 目录信息
 */
async function getDirectoryInfo(params) {
  let dirPath = '';
  
  // 处理不同类型的参数
  if (typeof params === 'string') {
    dirPath = params;
  } else if (params && typeof params === 'object' && params.path) {
    dirPath = params.path;
  } else if (!params) {
    return { 
      success: false, 
      error: '目录路径参数不能为空' 
    };
  }
  
  // 确保路径是字符串类型
  if (typeof dirPath !== 'string') {
    return { 
      success: false, 
      error: '目录路径必须是字符串类型',
      path: dirPath
    };
  }
  
  try {
    // 检查目录是否存在
    if (!fs.existsSync(dirPath)) {
      return { 
        success: true, 
        path: dirPath, 
        exists: false 
      };
    }
    
    // 获取目录信息
    const stats = fs.statSync(dirPath);
    
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `路径不是目录: ${dirPath}`
      };
    }
    
    // 检查缓存
    let dirFiles = null;
    let fromCache = false;
    
    if (DIR_CACHE.enabled) {
      dirFiles = getFromDirCache(dirPath);
      if (dirFiles) {
        DIR_CACHE.stats.hits++;
        fromCache = true;
      } else {
        DIR_CACHE.stats.misses++;
      }
    }
    
    // 如果没有缓存，读取目录内容
    if (!dirFiles) {
      dirFiles = await getDirectoryContents(dirPath);
      
      // 添加到缓存
      if (DIR_CACHE.enabled) {
        addToDirCache(dirPath, dirFiles);
      }
    }
    
    // 计算目录大小
    const totalSize = dirFiles.reduce((sum, file) => sum + file.size, 0);
    
    logger.info(`获取目录信息: ${dirPath}`);
    
    return {
      success: true,
      path: dirPath,
      exists: true,
      isDirectory: true,
      size: totalSize,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      permissions: stats.mode,
      files: dirFiles,
      fromCache
    };
  } catch (error) {
    logger.error(`获取目录信息失败: ${error.message}`, { path: dirPath, error });
    return { success: false, error: error.message };
  }
}

// 从缓存获取目录内容
function getFromDirCache(dirPath) {
  if (!DIR_CACHE.enabled || !DIR_CACHE.items.has(dirPath)) {
    return null;
  }
  
  const cacheItem = DIR_CACHE.items.get(dirPath);
  const now = Date.now();
  
  // 检查缓存是否过期
  if (now - cacheItem.timestamp > DIR_CACHE.maxAge) {
    DIR_CACHE.items.delete(dirPath);
    stopMonitoringDirectory(dirPath); // 停止监控已过期的目录
    return null;
  }
  
  // 更新访问时间并返回缓存内容
  cacheItem.lastAccessed = now;
  DIR_CACHE.stats.hits++;
  return cacheItem.content;
}

// 添加目录内容到缓存
function addToDirCache(dirPath, content) {
  if (!DIR_CACHE.enabled) {
    return;
  }
  
  // 检查缓存大小，必要时清理旧缓存
  if (DIR_CACHE.items.size >= DIR_CACHE.maxSize) {
    evictFromDirCache();
  }
  
  const now = Date.now();
  DIR_CACHE.items.set(dirPath, {
    content,
    timestamp: now,
    lastAccessed: now
  });
  
  // 添加目录监控
  monitorDirectoryForCache(dirPath);
}

// 清理缓存中最久未访问的项
function evictFromDirCache() {
  let oldestTime = Date.now();
  let oldestPath = null;
  
  // 找到最久未访问的缓存项
  for (const [path, item] of DIR_CACHE.items.entries()) {
    if (item.lastAccessed < oldestTime) {
      oldestTime = item.lastAccessed;
      oldestPath = path;
    }
  }
  
  // 删除该项
  if (oldestPath) {
    DIR_CACHE.items.delete(oldestPath);
    stopMonitoringDirectory(oldestPath); // 停止监控被清理的目录
    DIR_CACHE.stats.evictions++;
  }
}

/**
 * 使指定目录的缓存失效
 * @param {string} dirPath 目录路径
 */
function invalidateDirCache(dirPath) {
  if (!DIR_CACHE.enabled) {
    return;
  }
  
  // 如果指定目录在缓存中，则删除
  if (DIR_CACHE.items.has(dirPath)) {
    logger.debug(`目录缓存失效: ${dirPath}`);
    DIR_CACHE.items.delete(dirPath);
  }
  
  // 同时使父目录的缓存失效，因为子目录变化会影响父目录的列表
  try {
    const parentDir = path.dirname(dirPath);
    if (parentDir !== dirPath) { // 避免root目录的情况
      if (DIR_CACHE.items.has(parentDir)) {
        logger.debug(`父目录缓存失效: ${parentDir} (因为 ${dirPath} 变化)`);
        DIR_CACHE.items.delete(parentDir);
      }
    }
  } catch (err) {
    // 忽略错误
  }
}

// 清理目录缓存
function clearDirCache() {
  // 停止所有目录监控
  for (const dirPath of DIR_MONITORS.monitoredPaths) {
    stopMonitoringDirectory(dirPath);
  }
  
  DIR_CACHE.items.clear();
  return { 
    success: true, 
    message: '目录缓存已清理',
    stats: { ...DIR_CACHE.stats }
  };
}

// 获取目录缓存统计信息
function getDirCacheStats() {
  return {
    enabled: DIR_CACHE.enabled,
    size: DIR_CACHE.items.size,
    maxSize: DIR_CACHE.maxSize,
    maxAge: DIR_CACHE.maxAge,
    monitoring: {
      enabled: DIR_MONITORS.enabled,
      count: DIR_MONITORS.monitoredPaths.size
    },
    stats: { ...DIR_CACHE.stats }
  };
}

/**
 * 获取目录内容（内部函数）
 * @param {string} dirPath 目录路径
 * @returns {Promise<Array>} 目录文件和文件夹列表
 */
async function getDirectoryContents(dirPath) {
  try {
    // 读取目录内容
    const entries = await readdir(dirPath, { withFileTypes: true });
    const result = [];
    
    for (const entry of entries) {
      const itemPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(dirPath, itemPath);
      
      // 创建基本信息对象
      const itemInfo = {
        name: entry.name,
        path: itemPath,
        relativePath: relativePath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink(),
        size: 0
      };
      
      // 尝试获取详细信息
      try {
        const stats = await stat(itemPath);
        itemInfo.size = stats.size;
        itemInfo.createdAt = stats.birthtime;
        itemInfo.modifiedAt = stats.mtime;
        itemInfo.accessedAt = stats.atime;
      } catch (error) {
        // 忽略无法获取详细信息的错误
        logger.debug(`无法获取文件详细信息: ${itemPath}`, { error: error.message });
      }
      
      result.push(itemInfo);
    }
    
    return result;
  } catch (error) {
    logger.error(`获取目录内容失败: ${dirPath}`, { error });
    throw error;
  }
}

module.exports = {
  createDirectory,
  deleteDirectory,
  listFiles,
  directoryExists,
  getDirectoryInfo,
  getDirectoryContents,
  clearDirCache,
  getDirCacheStats,
  invalidateDirCache,
  setConfig: function(config) {
    if (config.hasOwnProperty('dirCacheEnabled')) {
      DIR_CACHE.enabled = !!config.dirCacheEnabled;
      
      // 如果禁用缓存，清理所有监控
      if (!DIR_CACHE.enabled) {
        clearDirCache();
      }
    }
    if (config.maxDirCacheSize && typeof config.maxDirCacheSize === 'number') {
      DIR_CACHE.maxSize = config.maxDirCacheSize;
    }
    if (config.maxDirCacheAge && typeof config.maxDirCacheAge === 'number') {
      DIR_CACHE.maxAge = config.maxDirCacheAge;
    }
    
    return { 
      success: true, 
      message: '目录工具配置已更新',
      config: {
        dirCacheEnabled: DIR_CACHE.enabled,
        maxDirCacheSize: DIR_CACHE.maxSize,
        maxDirCacheAge: DIR_CACHE.maxAge
      }
    };
  },
  monitorDirectoryForCache,
  stopMonitoringDirectory
}; 
