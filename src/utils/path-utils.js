/**
 * 路径工具模块
 * 负责路径安全验证
 */
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('./logging');

/**
 * 净化和标准化路径
 * @param {string} filePath 待处理的路径
 * @returns {string} 处理后的路径
 */
function sanitizePath(filePath) {
  if (!filePath) {
    return '';
  }
  
  // 确保输入是字符串
  if (typeof filePath !== 'string') {
    // 如果传入的是对象，尝试从path属性获取路径
    if (filePath && typeof filePath === 'object' && filePath.path && typeof filePath.path === 'string') {
      filePath = filePath.path;
    } else {
      logger.error('路径必须是字符串类型', { filePath });
      throw new TypeError('路径必须是字符串类型');
    }
  }
  
  // 标准化路径
  return path.normalize(filePath);
}

/**
 * 安全路径验证
 * @param {string} filePath 待验证的路径
 * @returns {string} 验证后的路径
 * @throws {Error} 如果路径不安全，抛出错误
 */
function validatePath(filePath) {
  if (!filePath) {
    throw new Error('路径不能为空');
  }
  
  // 标准化路径
  const normalizedPath = path.normalize(filePath);
  
  // 检查路径遍历攻击
  if (config.security.pathSecurity.checkPathTraversal) {
    // 路径中不应该包含 '..'
    if (normalizedPath.includes('..')) {
      logger.warn('检测到路径遍历尝试', { path: filePath });
      throw new Error('安全限制: 不允许路径遍历');
    }
  }
  
  // 检查相对路径
  if (config.security.pathSecurity.preventRelativePaths) {
    if (!path.isAbsolute(normalizedPath)) {
      logger.warn('拒绝相对路径', { path: filePath });
      throw new Error('安全限制: 不允许使用相对路径');
    }
  }
  
  // 检查绝对路径
  if (config.security.pathSecurity.preventAbsolutePaths) {
    if (path.isAbsolute(normalizedPath)) {
      logger.warn('拒绝绝对路径', { path: filePath });
      throw new Error('安全限制: 不允许使用绝对路径');
    }
  }
  
  // 检查路径白名单
  const { allowedPaths } = config.security.pathSecurity;
  if (allowedPaths && allowedPaths.length > 0) {
    const isAllowed = allowedPaths.some(allowedPath => 
      normalizedPath === allowedPath || normalizedPath.startsWith(allowedPath + path.sep)
    );
    
    if (!isAllowed) {
      logger.warn('路径不在白名单中', { path: filePath, allowedPaths });
      throw new Error('安全限制: 路径不在允许访问的范围内');
    }
  }
  
  // 检查路径黑名单
  const { forbiddenPaths } = config.security.pathSecurity;
  if (forbiddenPaths && forbiddenPaths.length > 0) {
    const isForbidden = forbiddenPaths.some(forbiddenPath => 
      normalizedPath === forbiddenPath || normalizedPath.startsWith(forbiddenPath + path.sep)
    );
    
    if (isForbidden) {
      logger.warn('路径在黑名单中', { path: filePath, forbiddenPaths });
      throw new Error('安全限制: 路径在禁止访问的范围内');
    }
  }
  
  // 检查隐藏文件
  if (config.security.pathSecurity.preventHiddenFiles) {
    const filename = path.basename(normalizedPath);
    if (filename.startsWith('.')) {
      logger.warn('尝试访问隐藏文件', { path: filePath });
      throw new Error('安全限制: 不允许访问隐藏文件');
    }
  }
  
  // 检查文件扩展名
  const extension = path.extname(normalizedPath).toLowerCase();
  if (extension) {
    // 检查禁止的扩展名
    const { forbiddenExtensions } = config.security.pathSecurity;
    if (forbiddenExtensions && forbiddenExtensions.includes(extension)) {
      logger.warn('尝试访问禁止的文件类型', { path: filePath, extension });
      throw new Error(`安全限制: 不允许访问 ${extension} 类型的文件`);
    }
    
    // 检查允许的扩展名
    const { allowedExtensions } = config.security.pathSecurity;
    if (allowedExtensions && allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      logger.warn('尝试访问非允许的文件类型', { path: filePath, extension });
      throw new Error(`安全限制: 只允许访问指定类型的文件`);
    }
  }
  
  return normalizedPath;
}

/**
 * 检查路径是否存在
 * @param {string} filePath 文件路径
 * @returns {Promise<boolean>} 如果路径存在返回true，否则返回false
 */
async function pathExists(filePath) {
  try {
    const validPath = validatePath(filePath);
    await fs.promises.access(validPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    // 如果是安全错误，重新抛出
    if (error.message.startsWith('安全限制:')) {
      throw error;
    }
    logger.error('检查路径存在时出错', { path: filePath, error });
    return false;
  }
}

/**
 * 确保目录存在，如果不存在则创建
 * @param {string} dirPath 目录路径
 * @param {boolean} recursive 是否递归创建
 * @returns {Promise<string>} 创建的目录路径
 */
async function ensureDir(dirPath, recursive = true) {
  try {
    const validPath = validatePath(dirPath);
    
    // 检查目录是否存在
    try {
      const stats = await fs.promises.stat(validPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径存在但不是目录: ${validPath}`);
      }
      return validPath;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      
      // 创建目录
      await fs.promises.mkdir(validPath, { recursive });
      logger.debug('创建目录', { path: validPath });
      return validPath;
    }
  } catch (error) {
    logger.error('确保目录存在时出错', { path: dirPath, error });
    throw error;
  }
}

/**
 * 获取文件信息
 * @param {string} filePath 文件路径
 * @returns {Promise<fs.Stats>} 文件信息
 */
async function getFileInfo(filePath) {
  try {
    const validPath = validatePath(filePath);
    return await fs.promises.stat(validPath);
  } catch (error) {
    logger.error('获取文件信息时出错', { path: filePath, error });
    throw error;
  }
}

module.exports = {
  validatePath,
  pathExists,
  ensureDir,
  getFileInfo,
  sanitizePath
}; 