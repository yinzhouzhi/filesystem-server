/**
 * 文件操作处理模块
 * 处理文件相关的操作请求，调用工具模块执行具体操作
 */
const fileTools = require('../tools/file-tools');
const dirTools = require('../tools/dir-tools');
const lineTools = require('../tools/line-tools');
const logger = require('../utils/logging');

/**
 * 处理文件操作请求
 * @param {Object} command 操作命令
 * @returns {Promise<Object>} 操作结果
 */
async function handleFileOperation(command) {
  const { operation, params } = command;
  
  logger.debug(`处理文件操作: ${operation}`, { params });
  
  try {
    let result;
    
    // 根据操作类型调用对应的工具函数
    switch (operation) {
      // 文件工具操作
      case 'readFile':
        result = await fileTools.readFile(params);
        break;
      case 'writeFile':
        result = await fileTools.writeFile(params);
        break;
      case 'appendFile':
        result = await fileTools.appendFile(params);
        break;
      case 'deleteFile':
        result = await fileTools.deleteFile(params);
        break;
      case 'copyFile':
        result = await fileTools.copyFile(params);
        break;
      case 'moveFile':
        result = await fileTools.moveFile(params);
        break;
      case 'getFileInfo':
        result = await fileTools.getFileInfo(params);
        break;
      case 'fileExists':
        result = await fileTools.fileExists(params);
        break;
      
      // 目录工具操作
      case 'listFiles':
        result = await dirTools.listFiles(params);
        break;
      case 'createDirectory':
        result = await dirTools.createDirectory(params);
        break;
      case 'deleteDirectory':
        result = await dirTools.deleteDirectory(params);
        break;
      case 'directoryExists':
        result = await dirTools.directoryExists(params);
        break;
      case 'getDirectoryInfo':
        result = await dirTools.getDirectoryInfo(params);
        break;
      
      // 文件行操作
      case 'readFileLines':
        result = await lineTools.readFileLines(params);
        break;
      case 'countFileLines':
        result = await lineTools.countFileLines(params);
        break;
      case 'searchFileContent':
        result = await lineTools.searchFileContent(params);
        break;
      
      default:
        logger.error(`未知的文件操作: ${operation}`);
        throw new Error(`不支持的文件操作: ${operation}`);
    }
    
    logger.debug(`文件操作成功: ${operation}`, { 
      operation, 
      success: true,
      resultType: typeof result
    });
    
    return {
      success: true,
      operation,
      result
    };
  } catch (error) {
    // 记录错误
    logger.error(`文件操作失败: ${operation}`, { 
      operation, 
      params, 
      error: error.message,
      stack: error.stack
    });
    
    // 构建错误响应
    return {
      success: false,
      operation,
      error: {
        message: error.message,
        code: error.code || 'OPERATION_FAILED'
      }
    };
  }
}

/**
 * 获取支持的操作列表
 * @returns {Array<Object>} 支持的操作列表及其说明
 */
function getSupportedOperations() {
  return [
    // 文件工具操作
    {
      name: 'readFile',
      description: '读取文件内容',
      params: ['path', 'encoding']
    },
    {
      name: 'writeFile',
      description: '写入文件内容',
      params: ['path', 'content', 'encoding']
    },
    {
      name: 'appendFile',
      description: '追加内容到文件',
      params: ['path', 'content', 'encoding']
    },
    {
      name: 'deleteFile',
      description: '删除文件',
      params: ['path']
    },
    {
      name: 'copyFile',
      description: '复制文件',
      params: ['source', 'destination', 'overwrite']
    },
    {
      name: 'moveFile',
      description: '移动/重命名文件',
      params: ['source', 'destination', 'overwrite']
    },
    {
      name: 'getFileInfo',
      description: '获取文件信息',
      params: ['path']
    },
    {
      name: 'fileExists',
      description: '检查文件是否存在',
      params: ['path']
    },
    
    // 目录工具操作
    {
      name: 'listFiles',
      description: '列出目录中的文件',
      params: ['path']
    },
    {
      name: 'createDirectory',
      description: '创建目录',
      params: ['path', 'recursive']
    },
    {
      name: 'deleteDirectory',
      description: '删除目录',
      params: ['path', 'recursive']
    },
    {
      name: 'directoryExists',
      description: '检查目录是否存在',
      params: ['path']
    },
    {
      name: 'getDirectoryInfo',
      description: '获取目录信息',
      params: ['path']
    },
    
    // 文件行操作
    {
      name: 'readFileLines',
      description: '读取文件的指定行范围',
      params: ['path', 'start', 'end', 'encoding']
    },
    {
      name: 'countFileLines',
      description: '统计文件行数',
      params: ['path']
    },
    {
      name: 'searchFileContent',
      description: '搜索文件内容',
      params: ['path', 'pattern', 'regex', 'ignoreCase', 'encoding']
    }
  ];
}

module.exports = {
  handleFileOperation,
  getSupportedOperations
}; 