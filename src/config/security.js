/**
 * 安全配置与安全工具函数
 * 集成了安全配置和所有安全验证函数
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logging');

// 安全配置
const securityConfig = {
  // 路径安全设置
  pathSecurity: {
    // 检查路径遍历
    checkPathTraversal: true,
    
    // 检查相对路径 (禁用)
    preventRelativePaths: false,
    
    // 检查绝对路径 (禁用)
    preventAbsolutePaths: false,
    
    // 检查符号链接
    followSymlinks: true,
    
    // 路径白名单 - 允许访问的路径
    // 注意：此配置已禁用，仅作为历史记录保留
    // 现在使用黑名单模式，所有路径默认允许访问，除非在黑名单中
    allowedPaths: [],
    
    // 路径黑名单 - 禁止访问的路径
    forbiddenPaths: [
      // 系统关键目录
      '/etc',
      '/var',
      '/boot',
      '/proc',
      '/sys',
      '/dev',
      
      // Windows系统目录
      'C:\\Windows',
      'C:\\Program Files',
      'C:\\Program Files (x86)'
    ],
    
    // 阻止访问隐藏文件 (禁用)
    preventHiddenFiles: false,
    
    // 允许的文件扩展名 (空数组表示不限制)
    allowedExtensions: [],
    
    // 禁止的文件扩展名
    forbiddenExtensions: [
      '.exe', '.dll', '.sys', '.bat', '.cmd', '.sh'
    ]
  },
  
  // 操作安全设置
  operationSecurity: {
    // 是否允许删除文件
    allowDelete: true,
    
    // 是否允许写入文件
    allowWrite: true,
    
    // 是否允许创建目录
    allowCreateDirectory: true,
    
    // 是否允许删除目录
    allowDeleteDirectory: true,
    
    // 是否允许递归删除目录
    allowRecursiveDelete: true,
    
    // 最大允许的写入文件大小 (字节)
    maxWriteSize: 50 * 1024 * 1024, // 50MB
    
    // 最大允许的读取文件大小 (字节)
    maxReadSize: 100 * 1024 * 1024 // 100MB
  }
};

// ===== 安全工具函数 =====

/**
 * 检查路径是否安全 (只使用黑名单)
 * @param {string} pathToCheck 待检查的路径
 * @returns {Object} 检查结果
 */
function isPathSafe(pathToCheck) {
  if (!pathToCheck) {
    return { isValid: false, reason: '路径为空' };
  }
  
  try {
    // 标准化路径
    const normalizedPath = path.normalize(pathToCheck);
    
    // 检查是否在黑名单中
    if (securityConfig.pathSecurity.checkPathTraversal) {
      // 检查禁止的路径
      const { forbiddenPaths } = securityConfig.pathSecurity;
      for (const forbiddenPath of forbiddenPaths) {
        if (normalizedPath.includes(forbiddenPath) || 
            normalizedPath.toLowerCase().includes(forbiddenPath.toLowerCase())) {
          return { 
            isValid: false, 
            reason: `路径包含禁止访问的目录: ${forbiddenPath}` 
          };
        }
      }
    }
    
    // 检查文件扩展名
    const extension = path.extname(normalizedPath).toLowerCase();
    if (extension) {
      // 检查禁止的扩展名
      if (securityConfig.pathSecurity.forbiddenExtensions.includes(extension)) {
        return { 
          isValid: false, 
          reason: `不允许的文件扩展名: ${extension}` 
        };
      }
    }
    
    // 如果没有被禁止，则认为是安全的
    return { isValid: true };
  } catch (error) {
    logger.error('路径安全性检查失败', { error: error.message, path: pathToCheck });
    return { isValid: false, reason: `路径验证错误: ${error.message}` };
  }
}

/**
 * 获取安全的绝对路径 (使用黑名单检查)
 * @param {string} inputPath 输入路径
 * @returns {string|null} 安全的绝对路径，如果不安全则返回null
 */
function getSafePath(inputPath) {
  // 先进行安全检查
  const pathCheck = isPathSafe(inputPath);
  if (!pathCheck.isValid) {
    logger.warn('路径安全检查失败', { path: inputPath, reason: pathCheck.reason });
    return null;
  }
  
  // 转换为绝对路径
  return path.isAbsolute(inputPath) 
    ? inputPath 
    : path.resolve(process.cwd(), inputPath);
}

/**
 * 检查文件大小是否在允许范围内 (无限制)
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否在允许范围内
 */
function isFileSizeAllowed(filePath) {
  // 所有文件大小都允许
  return true;
}

/**
 * 验证命令的安全性 (使用黑名单)
 * @param {Object} command 命令对象
 * @returns {Object} 验证结果 {isValid: boolean, reason: string}
 */
function validateCommand(command) {
  // 基本格式验证
  if (!command || typeof command !== 'object') {
    return { isValid: false, reason: '命令格式无效' };
  }
  
  // ID验证
  if (!command.id || typeof command.id !== 'string') {
    return { isValid: false, reason: '命令ID无效' };
  }
  
  // 类型验证
  if (!command.type || typeof command.type !== 'string') {
    return { isValid: false, reason: '命令类型无效' };
  }
  
  // 操作验证
  if (!command.action || typeof command.action !== 'string') {
    return { isValid: false, reason: '命令操作无效' };
  }
  
  // 参数验证
  if (command.params && typeof command.params !== 'object') {
    return { isValid: false, reason: '命令参数格式无效' };
  }
  
  // 如果是文件操作，检查路径安全性
  if (command.type === 'fileOperation' && command.params) {
    const pathParams = [
      'path', 'filePath', 'dirPath', 'sourcePath', 'targetPath', 
      'directoryPath', 'source', 'target', 'directory'
    ];
    
    // 检查所有可能的路径参数
    for (const paramName of pathParams) {
      if (command.params[paramName]) {
        const pathValue = command.params[paramName];
        const pathCheck = isPathSafe(pathValue);
        
        if (!pathCheck.isValid) {
          return { 
            isValid: false, 
            reason: `路径安全检查失败 (${paramName}): ${pathCheck.reason}` 
          };
        }
      }
    }
    
    // 检查文件扩展名是否被禁止
    if (command.action === 'writeFile' || command.action === 'appendFile') {
      const filePath = command.params.filePath || command.params.path;
      if (filePath) {
        const extension = path.extname(filePath).toLowerCase();
        if (extension && securityConfig.pathSecurity.forbiddenExtensions.includes(extension)) {
          return { 
            isValid: false, 
            reason: `不允许的文件扩展名: ${extension}` 
          };
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * 验证上下文的可信度 (无限制)
 * @param {Object} context 操作上下文
 * @returns {boolean} 是否可信
 */
function validateContext(context = {}) {
  // 所有上下文都可信
  return true;
}

/**
 * 检查操作权限 (无限制)
 * @param {string} operation 操作类型
 * @param {Object} context 操作上下文
 * @returns {boolean} 是否有权限
 */
function checkOperationPermission(operation, context = {}) {
  // 所有操作都允许
  return true;
}

/**
 * 验证工具调用的安全性
 * @param {string} toolName 工具名称
 * @param {Object} params 参数
 * @param {Object} context 上下文
 * @returns {boolean} 是否允许调用
 */
function validateToolCall(toolName, params = {}, context = {}) {
  // 默认允许工具调用
  let isAllowed = true;
  
  switch (toolName) {
    // 文件操作
    case 'read_file':
    case 'read_word_document':
    case 'read_excel_file':
    case 'read_file_lines':
    case 'count_file_lines':
    case 'search_file_content':
    case 'file_exists':
    case 'file_info':
      // 检查是否有读取权限
      isAllowed = true;
      
      // 检查路径安全性
      if (params.path) {
        const pathCheck = isPathSafe(params.path);
        isAllowed = pathCheck.isValid;
      }
      break;
    
    // 写入文件相关操作
    case 'write_file':
    case 'append_file':
      // 检查是否允许写入
      isAllowed = securityConfig.operationSecurity.allowWrite;
      
      // 检查路径安全性
      if (params.path) {
        const pathCheck = isPathSafe(params.path);
        isAllowed = isAllowed && pathCheck.isValid;
      }
      
      // 检查内容大小
      if (params.content) {
        try {
          const contentSize = Buffer.byteLength(params.content, params.encoding || 'utf8');
          if (contentSize > securityConfig.operationSecurity.maxWriteSize) {
            logger.warn(`写入内容大小超过限制`, {
              size: contentSize,
              limit: securityConfig.operationSecurity.maxWriteSize
            });
            isAllowed = false;
          }
        } catch (error) {
          logger.error(`内容大小检查失败`, { error: error.message });
          isAllowed = false;
        }
      }
      break;
    
    // 删除文件
    case 'delete_file':
      // 检查是否允许删除
      isAllowed = securityConfig.operationSecurity.allowDelete;
      
      // 检查路径安全性
      if (params.path) {
        const pathCheck = isPathSafe(params.path);
        isAllowed = isAllowed && pathCheck.isValid;
      }
      break;
    
    // 目录操作
    case 'create_directory':
      // 检查是否允许创建目录
      isAllowed = securityConfig.operationSecurity.allowCreateDirectory;
      
      // 检查路径安全性
      if (params.path) {
        const pathCheck = isPathSafe(params.path);
        isAllowed = isAllowed && pathCheck.isValid;
      }
      break;
    
    // 删除目录
    case 'delete_directory':
      // 检查是否允许删除目录
      isAllowed = securityConfig.operationSecurity.allowDeleteDirectory;
      
      // 如果是递归删除，检查是否允许递归删除
      if (params.recursive) {
        isAllowed = isAllowed && securityConfig.operationSecurity.allowRecursiveDelete;
      }
      
      // 检查路径安全性
      if (params.path) {
        const pathCheck = isPathSafe(params.path);
        isAllowed = isAllowed && pathCheck.isValid;
      }
      break;
    
    // 复制文件
    case 'copy_file':
      // 检查路径安全性
      if (params.source) {
        const sourcePathCheck = isPathSafe(params.source);
        isAllowed = isAllowed && sourcePathCheck.isValid;
      }
      
      if (params.destination) {
        const destPathCheck = isPathSafe(params.destination);
        isAllowed = isAllowed && destPathCheck.isValid;
      }
      break;
    
    // 移动文件
    case 'move_file':
      // 检查路径安全性
      if (params.source) {
        const sourcePathCheck = isPathSafe(params.source);
        isAllowed = isAllowed && sourcePathCheck.isValid;
      }
      
      if (params.destination) {
        const destPathCheck = isPathSafe(params.destination);
        isAllowed = isAllowed && destPathCheck.isValid;
      }
      break;
    
    // 默认放行
    default:
      isAllowed = true;
      break;
  }
  
  // 记录工具调用
  if (isAllowed) {
    logger.info(`工具调用已放行: ${toolName}`);
  } else {
    logger.warn(`工具调用被拒绝: ${toolName}`);
  }
  return isAllowed;
}

/**
 * 配置安全选项 (无限制)
 * @param {Object} options 安全配置选项
 */
function configure(options = {}) {
  // 不做任何限制配置
  if (options.pathSecurity) {
    securityConfig.pathSecurity = {
      ...securityConfig.pathSecurity,
      ...options.pathSecurity
    };
  }
  
  if (options.operationSecurity) {
    securityConfig.operationSecurity = {
      ...securityConfig.operationSecurity,
      ...options.operationSecurity
    };
  }
  
  logger.info('安全配置已更新 (无权限限制)');
}

/**
 * 检查路径是否允许访问（异步版本）
 * @param {string} pathToCheck 待检查的路径
 * @returns {Promise<boolean>} 是否允许访问
 */
async function isPathAllowed(pathToCheck) {
  try {
    const result = isPathSafe(pathToCheck);
    return result.isValid;
  } catch (error) {
    logger.error('路径安全检查失败', { error, path: pathToCheck });
    return false;
  }
}

// 导出安全配置和函数
module.exports = {
  // 安全配置
  pathSecurity: securityConfig.pathSecurity,
  operationSecurity: securityConfig.operationSecurity,
  
  // 安全工具函数
  isPathSafe,
  isPathAllowed,
  getSafePath,
  isFileSizeAllowed,
  validateCommand,
  validateContext,
  validateToolCall,
  
  // 配置函数
  configure
}; 