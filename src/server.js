/**
 * 本地文件系统操作服务器
 * 基于STDIO通信，提供安全的文件系统操作能力
 */
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const readline = require('readline');
const fileHandler = require('./handlers/file-handler');
const securityUtils = require('./config/security');
const logger = require('./utils/logging');

// 初始化环境
let isDebug = process.env.DEBUG_MODE === 'true';
const logLevel = process.env.LOG_LEVEL || (isDebug ? 'debug' : 'info');

// 配置日志
logger.initialize({
  level: logLevel,
  logToFile: true,
  logFilePath: path.join(process.cwd(), 'logs', 'filesystem-server.log')
});

logger.info('文件系统服务器启动中...');

/**
 * 处理接收到的命令
 * @param {string} commandStr JSON格式的命令字符串
 * @returns {Promise<Object>} 执行结果
 */
async function processCommand(commandStr) {
  try {
    // 解析命令
    const command = JSON.parse(commandStr);
    
    // 验证命令格式
    if (!command.id || !command.type || !command.action) {
      return {
        success: false,
        error: {
          message: '无效的命令格式，缺少必要字段',
          code: 'INVALID_COMMAND'
        }
      };
    }
    
    // 命令安全性检查
    const securityCheck = securityUtils.validateCommand(command);
    if (!securityCheck.isValid) {
      logger.warn('命令安全验证失败', { 
        commandId: command.id, 
        reason: securityCheck.reason 
      });
      
      return {
        success: false,
        id: command.id,
        error: {
          message: `安全验证失败: ${securityCheck.reason}`,
          code: 'SECURITY_VIOLATION'
        }
      };
    }
    
    // 处理文件操作命令
    if (command.type === 'fileOperation') {
      const result = await fileHandler.handleFileOperation({
        operation: command.action,
        params: command.params || {}
      });
      
      return {
        ...result,
        id: command.id
      };
    } 
    
    // 处理特殊控制命令
    else if (command.type === 'control') {
      return handleControlCommand(command);
    } 
    
    // 未知命令类型
    else {
      logger.warn(`未知的命令类型: ${command.type}`, { commandId: command.id });
      return {
        success: false,
        id: command.id,
        error: {
          message: `不支持的命令类型: ${command.type}`,
          code: 'UNSUPPORTED_COMMAND_TYPE'
        }
      };
    }
  } catch (error) {
    logger.error('处理命令时发生错误', { error: error.message, stack: error.stack });
    
    // 命令格式错误（无法解析JSON）
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: {
          message: '命令格式无效: 无法解析JSON',
          code: 'INVALID_JSON'
        }
      };
    }
    
    // 其他错误
    return {
      success: false,
      error: {
        message: `处理命令时发生错误: ${error.message}`,
        code: error.code || 'COMMAND_PROCESSING_ERROR'
      }
    };
  }
}

/**
 * 处理控制命令
 * @param {Object} command 控制命令
 * @returns {Object} 执行结果
 */
function handleControlCommand(command) {
  const { action, params = {} } = command;
  
  switch (action) {
    // 获取服务信息
    case 'getStatus':
      return {
        success: true,
        id: command.id,
        result: {
          status: 'running',
          version: require('../package.json').version,
          pid: process.pid,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          isDebug
        }
      };
      
    // 获取支持的文件操作
    case 'getSupportedOperations':
      return {
        success: true,
        id: command.id,
        result: fileHandler.getSupportedOperations()
      };
      
    // 设置日志级别
    case 'setLogLevel':
      if (params.level) {
        logger.configure({ level: params.level });
        logger.info(`日志级别已更改为: ${params.level}`);
        return {
          success: true,
          id: command.id,
          result: { level: params.level }
        };
      }
      return {
        success: false,
        id: command.id,
        error: {
          message: '缺少必要参数: level',
          code: 'MISSING_PARAM'
        }
      };
      
    // 设置调试模式
    case 'setDebugMode':
      if (typeof params.enabled === 'boolean') {
        isDebug = params.enabled;
        logger.configure({ 
          level: isDebug ? 'debug' : logLevel 
        });
        logger.info(`调试模式已${isDebug ? '启用' : '禁用'}`);
        return {
          success: true,
          id: command.id,
          result: { debugMode: isDebug }
        };
      }
      return {
        success: false,
        id: command.id,
        error: {
          message: '缺少必要参数: enabled (boolean)',
          code: 'MISSING_PARAM'
        }
      };
      
    // 关闭服务器
    case 'shutdown':
      logger.info('收到关闭服务器命令，即将关闭...');
      // 发送成功响应后关闭
      process.nextTick(() => {
        process.exit(0);
      });
      return {
        success: true,
        id: command.id,
        result: { message: '服务器正在关闭' }
      };
      
    default:
      logger.warn(`未知的控制命令: ${action}`, { commandId: command.id });
      return {
        success: false,
        id: command.id,
        error: {
          message: `不支持的控制命令: ${action}`,
          code: 'UNSUPPORTED_CONTROL_ACTION'
        }
      };
  }
}

/**
 * 主函数：设置STDIO通信
 */
function main() {
  // 创建readline接口以读取标准输入
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  // 显式关闭换行转换，确保原始二进制传输
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }

  // 日志目录确保存在
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  logger.info('文件系统服务器已启动，等待命令...');
  
  // 接收命令行
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    
    try {
      logger.debug('收到命令', { line: line.substring(0, 100) + (line.length > 100 ? '...' : '') });
      
      // 处理命令
      const result = await processCommand(line);
      
      // 确保响应包含ID
      if (!result.id && line.id) {
        result.id = line.id;
      }
      
      // 发送响应
      const response = JSON.stringify(result);
      process.stdout.write(response + '\n');
      
      logger.debug('发送响应', { 
        id: result.id,
        success: result.success,
        responseLength: response.length
      });
    } catch (error) {
      logger.error('处理命令时发生未捕获错误', { 
        error: error.message, 
        stack: error.stack 
      });
      
      // 发送错误响应
      const errorResponse = JSON.stringify({
        success: false,
        error: {
          message: `服务器内部错误: ${error.message}`,
          code: 'INTERNAL_ERROR'
        }
      });
      
      process.stdout.write(errorResponse + '\n');
    }
  });

  // 处理标准输入流关闭
  rl.on('close', () => {
    logger.info('标准输入流已关闭，服务器即将退出');
    process.exit(0);
  });

  // 处理进程错误
  process.on('uncaughtException', (error) => {
    logger.error('未捕获异常', { error: error.message, stack: error.stack });
  });

  // 处理进程警告
  process.on('warning', (warning) => {
    logger.warn('进程警告', { warning: warning.message, stack: warning.stack });
  });

  // 处理进程被终止信号
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      logger.info(`收到 ${signal} 信号，服务器即将退出`);
      process.exit(0);
    });
  });
}

// 启动服务器
main(); 