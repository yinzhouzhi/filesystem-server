/**
 * 本地文件系统操作服务器 - MCP规范实现
 * 基于Model Context Protocol SDK
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const fileTools = require('./tools/file-tools');
const dirTools = require('./tools/dir-tools');
const lineTools = require('./tools/line-tools');
const watchTools = require('./tools/watch-tools');
const officeTools = require('./tools/office-tools');
const logger = require('./utils/logging');

// 初始化环境
const isDebug = process.env.DEBUG_MODE === 'true';
const logLevel = process.env.LOG_LEVEL || (isDebug ? 'debug' : 'info');

// 配置日志
logger.initialize({
  level: logLevel,
  logToFile: true,
  logFilePath: path.join(process.cwd(), 'logs', 'filesystem-server.log')
});

logger.info('MCP文件系统服务器启动中...');

// 创建MCP服务器实例
const server = new McpServer(
  {
    name: 'filesystem-server',
    version: '1.0.0',
    description: '本地文件系统操作服务'
  },
  {
    capabilities: {
      tools: {} // 启用工具功能
    }
  }
);

// 注册文件操作工具
function registerFileTools() {
  // 读取文件工具
  server.tool(
    'read_file',
    '读取文件内容',
    {
      path: z.string().describe('文件路径'),
      encoding: z.string().optional().describe('编码方式，默认utf-8')
    },
    async (params) => {
      try {
        // 直接使用本地fs读取文件，以确保正确获取内容
        const filePath = params.path;
        const encoding = params.encoding || 'utf8';
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ 
              type: 'text', 
              text: `文件不存在: ${filePath}` 
            }],
            isError: true
          };
        }
        
        // 读取文件内容
        const content = fs.readFileSync(filePath, { encoding });
        
        return {
          content: [{ 
            type: 'text', 
            text: content 
          }]
        };
      } catch (error) {
        logger.error(`读取文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ 
            type: 'text', 
            text: `读取文件失败: ${error.message}` 
          }],
          isError: true
        };
      }
    }
  );

  // 写入文件工具
  server.tool(
    'write_file',
    '写入文件内容',
    {
      path: z.string().describe('文件路径'),
      content: z.string().describe('文件内容'),
      encoding: z.string().optional().describe('编码方式，默认utf-8')
    },
    async (params) => {
      try {
        const result = await fileTools.writeFile(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, path: result.path }) }]
        };
      } catch (error) {
        logger.error(`写入文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `写入文件失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 追加文件工具
  server.tool(
    'append_file',
    '追加文件内容',
    {
      path: z.string().describe('文件路径'),
      content: z.string().describe('追加内容'),
      encoding: z.string().optional().describe('编码方式，默认utf-8')
    },
    async (params) => {
      try {
        const result = await fileTools.appendFile(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, path: result.path }) }]
        };
      } catch (error) {
        logger.error(`追加文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `追加文件失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 删除文件工具
  server.tool(
    'delete_file',
    '删除文件',
    {
      path: z.string().describe('文件路径')
    },
    async (params) => {
      try {
        const result = await fileTools.deleteFile(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, path: result.path }) }]
        };
      } catch (error) {
        logger.error(`删除文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `删除文件失败: ${error.message}` }],
          isError: true
        };
      }
    },
    { description: '删除文件' }
  );

  // 复制文件工具
  server.tool(
    'copy_file',
    '复制文件',
    {
      source: z.string().describe('源文件路径'),
      destination: z.string().describe('目标文件路径'),
      overwrite: z.boolean().optional().describe('如果目标文件存在是否覆盖')
    },
    async (params) => {
      try {
        const result = await fileTools.copyFile(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            source: result.source, 
            destination: result.destination 
          }) }]
        };
      } catch (error) {
        logger.error(`复制文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `复制文件失败: ${error.message}` }],
          isError: true
        };
      }
    } 
  );

  // 移动文件工具
  server.tool(
    'move_file',
    '移动文件',
    {
      source: z.string().describe('源文件路径'),
      destination: z.string().describe('目标文件路径'),
      overwrite: z.boolean().optional().describe('如果目标文件存在是否覆盖')
    },
    async (params) => {
      try {
        const result = await fileTools.moveFile(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            source: result.source, 
            destination: result.destination 
          }) }]
        };
      } catch (error) {
        logger.error(`移动文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `移动文件失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 获取文件信息工具
  server.tool(
    'get_file_info',
    '获取文件信息',
    {
      path: z.string().describe('文件路径')
    },
    async (params) => {
      try {
        const result = await fileTools.getFileInfo(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`获取文件信息工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `获取文件信息失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 检查文件是否存在工具
  server.tool(
    'file_exists',
    '检查文件是否存在', 
    {
      path: z.string().describe('文件路径')
    },
    async (params) => {
      try {
        const result = await fileTools.fileExists(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            exists: result.exists, 
            isFile: result.isFile 
          }) }]
        };
      } catch (error) {
        logger.error(`检查文件存在工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `检查文件是否存在失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册目录操作工具
function registerDirectoryTools() {
  // 列出文件工具
  server.tool(
    'list_files',
    '列出目录内容',
    {
      path: z.string().describe('目录路径'),
      recursive: z.boolean().optional().describe('是否递归列出子目录内容')
    },
    async (params) => {
      try {
        const result = await dirTools.listFiles(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`列出文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `列出目录内容失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 创建目录工具
  server.tool(
    'create_directory',
    '创建目录',
    {
      path: z.string().describe('目录路径'),
      recursive: z.boolean().optional().describe('是否递归创建父目录')
    },
    async (params) => {
      try {
        const result = await dirTools.createDirectory(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            path: result.path, 
            created: result.created 
          }) }]
        };
      } catch (error) {
        logger.error(`创建目录工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `创建目录失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 删除目录工具
  server.tool(
    'delete_directory',
    '删除目录',
    {
      path: z.string().describe('目录路径'),
      recursive: z.boolean().optional().describe('是否递归删除子目录和文件')
    },
    async (params) => {
      try {
        const result = await dirTools.deleteDirectory(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            path: result.path, 
            deleted: result.deleted 
          }) }]
        };
      } catch (error) {
        logger.error(`删除目录工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `删除目录失败: ${error.message}` }],
          isError: true
        };
      }
    },
    '删除目录'
  );

  // 检查目录是否存在工具
  server.tool(
    'directory_exists',
    '检查目录是否存在',
    {
      path: z.string().describe('目录路径')
    },
    async (params) => {
      try {
        const result = await dirTools.directoryExists(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ 
            success: true, 
            exists: result.exists, 
            isDirectory: result.isDirectory 
          }) }]
        };
      } catch (error) {
        logger.error(`检查目录存在工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `检查目录是否存在失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 获取目录信息工具
  server.tool(
    'directory_info',
    '获取目录信息',
    {
      path: z.string().describe('目录路径')
    },
    async (params) => {
      try {
        const result = await dirTools.getDirectoryInfo(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`获取目录信息工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `获取目录信息失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册文件行操作工具
function registerLineTools() {
  // 读取文件行工具
  server.tool(
    'read_file_lines',
    '读取文件行',
    {
      path: z.string().describe('文件路径'),
      start: z.number().int().describe('起始行号(从1开始)'),
      end: z.number().int().describe('结束行号'),
      encoding: z.string().optional().describe('编码方式，默认utf-8')
    },
    async (params) => {
      try {
        const result = await lineTools.readFileLines(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`读取文件行工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `读取文件行失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 统计文件行数工具
  server.tool(
    'count_file_lines',
    '统计文件行数',
    {
      path: z.string().describe('文件路径')
    },
    async (params) => {
      try {
        const result = await lineTools.countFileLines(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`统计文件行数工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `统计文件行数失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 搜索文件内容工具
  server.tool(
    'search_file_content',
    '搜索文件内容',
    {
      path: z.string().describe('文件路径'),
      pattern: z.string().describe('搜索模式'),
      regex: z.boolean().optional().describe('是否使用正则表达式'),
      ignoreCase: z.boolean().optional().describe('是否忽略大小写'),
      encoding: z.string().optional().describe('编码方式，默认utf-8')
    },
    async (params) => {
      try {
        const result = await lineTools.searchFileContent(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`搜索文件内容工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `搜索文件内容失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册文件监控工具
function registerWatchTools() {
  // 监控文件或目录变更工具
  server.tool(
    'watch_path',
    '监控文件或目录变更',
    {
      path: z.string().describe('要监控的文件或目录路径'),
      recursive: z.boolean().optional().describe('是否递归监控子目录'),
      events: z.string().optional().describe('监控的事件类型，逗号分隔')
    },
    async (params) => {
      try {
        const result = await watchTools.watchPath(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`监控文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `监控文件失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 停止监控工具
  server.tool(
    'stop_watch',
    '停止文件或目录监控',
    {
      watcherId: z.string().describe('监控ID')
    },
    async (params) => {
      try {
        const result = await watchTools.stopWatch(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`停止监控工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `停止监控失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 获取监控列表工具
  server.tool(
    'list_watchers',
    '获取当前活跃的监控列表',
    {},
    async () => {
      try {
        const result = await watchTools.listWatchers();
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`获取监控列表工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `获取监控列表失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册Office文件操作工具
function registerOfficeTools() {
  // Word文档读取工具
  server.tool(
    'read_word_document',
    '读取Word文档内容并转换为文本',
    {
      path: z.string().describe('Word文件路径(.doc或.docx格式)'),
      outputFormat: z.enum(['text', 'html']).optional().describe('输出格式，支持text和html，默认text'),
      extractImages: z.boolean().optional().describe('是否提取图片信息，默认false'),
      includeStyles: z.boolean().optional().describe('是否包含样式信息，默认false'),
      pagination: z.object({
        pageSize: z.number().int().positive().optional().describe('每页字符数'),
        pageNum: z.number().int().positive().optional().describe('页码(从1开始)')
      }).optional().describe('分页参数，用于大文档分页读取'),
      range: z.object({
        startLine: z.number().int().positive().optional().describe('起始行号(从1开始)'),
        endLine: z.number().int().positive().optional().describe('结束行号')
      }).optional().describe('读取范围，指定起始行和结束行'),
      splitByParagraphs: z.boolean().optional().describe('是否按段落拆分返回，默认false')
    },
    async (params) => {
      try {
        const result = await officeTools.readWordDocument(params);
        
        // 根据输出格式返回不同结构
        if (params.outputFormat === 'html') {
          // office-tools已经转换了内容为HTML格式，直接使用
          return {
            content: [{ type: 'html', text: result.content }]
          };
        } else {
          // 构建响应内容
          const responseContent = [{ type: 'text', text: result.content }];
          
          // 添加分页信息
          if (result.pagination) {
            responseContent.push({ 
              type: 'text', 
              text: `\n\n页码信息: 第${result.pagination.pageNum}页/共${result.pagination.totalPages}页，每页${result.pagination.pageSize}字符` 
            });
          }
          
          // 添加范围信息
          if (result.range) {
            responseContent.push({ 
              type: 'text', 
              text: `\n\n行范围信息: 第${result.range.startLine}行-第${result.range.endLine}行，总行数${result.range.totalLines}` 
            });
          }
          
          // 添加段落信息
          if (result.paragraphs) {
            responseContent.push({ 
              type: 'text', 
              text: `\n\n文档共${result.paragraphs.length}个段落` 
            });
          }
          
          // 添加图片信息
          if (result.images && result.images.length > 0) {
            responseContent.push({ 
              type: 'text', 
              text: `\n\n图片数量: ${result.images.length}` 
            });
          }
          
          return {
            content: responseContent
          };
        }
      } catch (error) {
        logger.error(`读取Word文档工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `读取Word文档失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // Excel文件读取工具
  server.tool(
    'read_excel_file',
    '读取Excel文件内容',
    {
      path: z.string().describe('Excel文件路径(.xlsx、.xls或.csv格式)'),
      sheet: z.union([
        z.string(),
        z.number()
      ]).optional().describe('要读取的工作表名称或索引，默认读取第一个工作表'),
      outputFormat: z.enum(['json', 'csv', 'array']).optional().describe('输出格式，支持json、csv和array，默认array'),
      range: z.object({
        startRow: z.number().optional(),
        endRow: z.number().optional(),
        startCol: z.number().optional(),
        endCol: z.number().optional()
      }).optional().describe('读取范围，例如{startRow:1, endRow:10, startCol:1, endCol:5}'),
      includeFormulas: z.boolean().optional().describe('是否包含公式，默认false'),
      headerRow: z.boolean().optional().describe('是否将第一行作为表头，默认false')
    },
    async (params) => {
      try {
        const result = await officeTools.readExcelFile(params);
        
        // 根据输出格式返回不同结构
        if (params.outputFormat === 'csv') {
          return {
            content: [{ type: 'text', text: result.data }]
          };
        } else {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({
                sheet: result.sheet.name,
                rowCount: result.range.rowCount,
                colCount: result.range.colCount,
                headers: result.headers,
                data: result.data.slice(0, 10), // 只返回前10行用于预览
                totalRows: result.data.length,
                availableSheets: result.availableSheets
              }, null, 2)
            }]
          };
        }
      } catch (error) {
        logger.error(`读取Excel文件工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `读取Excel文件失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册服务器状态工具
server.tool(  
  'get_server_status',
  '获取服务器状态',
  {},
  async () => {
    try {
      const packageJson = require('../package.json');
      const status = {
        status: 'running',
        version: packageJson.version,
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        isDebug
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(status) }]
      };
    } catch (error) {
      logger.error(`获取服务器状态失败: ${error.message}`, { error });
      return {
        content: [{ type: 'text', text: `获取服务器状态失败: ${error.message}` }],
        isError: true
      };
    }
  }
);

// 注册文件缓存工具
function registerCacheTools() {
  // 获取缓存统计信息
  server.tool(
    'get_cache_stats',
    '获取文件缓存统计数据',
    {},
    async () => {
      try {
        const stats = fileTools.getCacheStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats) }]
        };
      } catch (error) {
        logger.error(`获取缓存统计工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `获取缓存统计失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 设置文件缓存配置
  server.tool(
    'set_file_cache_config',
    '设置文件缓存配置',
    {
      enabled: z.boolean().optional().describe('是否启用缓存'),
      maxSize: z.number().optional().describe('最大缓存数量'),
      maxAge: z.number().optional().describe('缓存过期时间(毫秒)')
    },
    async (params) => {
      try {
        const result = fileTools.setConfig(params);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`设置缓存配置工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `设置缓存配置失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // 清除文件缓存
  server.tool(
    'clear_cache',
    '清除文件缓存',
    {},
    async () => {
      try {
        const result = fileTools.clearCache();
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (error) {
        logger.error(`清除缓存工具执行失败: ${error.message}`, { error });
        return {
          content: [{ type: 'text', text: `清除缓存失败: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// 注册监控回调相关工具
function registerMonitorCallbackTools() {
  // 设置文件变更回调
  server.tool(
    'set_file_change_callback',
    '设置文件变更回调',
    {
      filePath: z.string().describe('要监控的文件路径'),
      eventTypes: z.string().optional().describe('要监控的事件类型，逗号分隔，如：change,unlink')
    },
    async (params) => {
      try {
        const result = await watchTools.setFileChangeCallback(
          params.filePath,
          (event, path) => {
            logger.info(`文件变更事件: ${event}, 路径: ${path}`);
            // 这里可以添加更多回调处理逻辑
          },
          {
            events: params.eventTypes ? params.eventTypes.split(',') : ['change'],
            ignoreInitial: true
          }
        );
        
        if (!result) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                success: false,
                message: '设置文件变更回调失败'
              }) 
            }],
            isError: true
          };
        }
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: true,
              watcherId: result._poolId || 'unknown',
              message: `正在监控文件: ${params.filePath}`
            }) 
          }]
        };
      } catch (error) {
        logger.error(`设置文件变更回调工具执行失败: ${error.message}`, { error });
        return {
          content: [{ 
            type: 'text', 
            text: `设置文件变更回调失败: ${error.message}` 
          }],
          isError: true
        };
      }
    }
  );
  
  // 设置目录变更回调
  server.tool(
    'set_dir_change_callback',
    '设置目录变更回调',
    {
      dirPath: z.string().describe('要监控的目录路径'),
      eventTypes: z.string().optional().describe('要监控的事件类型，逗号分隔，如：add,change,unlink,addDir,unlinkDir'),
      recursive: z.boolean().optional().describe('是否递归监控子目录')
    },
    async (params) => {
      try {
        const result = await watchTools.setDirChangeCallback(
          params.dirPath,
          (event, path) => {
            logger.info(`目录变更事件: ${event}, 路径: ${path}`);
            // 这里可以添加更多回调处理逻辑
          },
          {
            events: params.eventTypes ? params.eventTypes.split(',') : ['add', 'change', 'unlink'],
            ignoreInitial: false,
            recursive: params.recursive !== false
          }
        );
        
        if (!result) {
          return {
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ 
                success: false,
                message: '设置目录变更回调失败'
              }) 
            }],
            isError: true
          };
        }
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: true,
              watcherId: result._poolId || 'unknown',
              message: `正在监控目录: ${params.dirPath}`
            }) 
          }]
        };
      } catch (error) {
        logger.error(`设置目录变更回调工具执行失败: ${error.message}`, { error });
        return {
          content: [{ 
            type: 'text', 
            text: `设置目录变更回调失败: ${error.message}` 
          }],
          isError: true
        };
      }
    }
  );
  
  // 关闭所有监控器
  server.tool(
    'close_all_watchers',
    '关闭所有监控器',
    {},
    async () => {
      try {
        const closedCount = watchTools.closeAllWatchers();
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              success: true,
              closed: closedCount,
              message: `已关闭所有监控器: ${closedCount}个`
            }) 
          }]
        };
      } catch (error) {
        logger.error(`关闭所有监控器工具执行失败: ${error.message}`, { error });
        return {
          content: [{ 
            type: 'text', 
            text: `关闭所有监控器失败: ${error.message}` 
          }],
          isError: true
        };
      }
    }
  );
  
  // 获取监控池状态
  server.tool(
    'get_monitor_pool_status',
    '获取监控池状态',
    {},
    async () => {
      try {
        const status = watchTools.getMonitorPoolStatus();
        return {
          content: [{ type: 'text', text: JSON.stringify(status) }]
        };
      } catch (error) {
        logger.error(`获取监控池状态工具执行失败: ${error.message}`, { error });
        return {
          content: [{ 
            type: 'text', 
            text: `获取监控池状态失败: ${error.message}` 
          }],
          isError: true
        };
      }
    }
  );
}

// 启动MCP服务器的主函数
async function startServer(options = {}) {
  try {
    // 确保传入的日志路径是正确的文件路径
    let logConfig = {
      level: options.logLevel || logLevel,
      logToFile: true,
      // 如果传入的是logDir，则使用它来构建日志文件路径；如果传入的是logPath，也兼容处理
      logFilePath: options.logDir 
        ? path.join(options.logDir, 'filesystem-server.log') 
        : (options.logPath 
            ? (fs.statSync(options.logPath).isDirectory() 
                ? path.join(options.logPath, 'filesystem-server.log') 
                : options.logPath) 
            : path.join(process.cwd(), 'logs', 'filesystem-server.log')),
      rotateLogFiles: true,
      maxLogFileSize: 10 * 1024 * 1024, // 10MB
      maxLogFiles: 5,
      compressRotatedLogs: true,
      rotationType: 'size'
    };
    
    // 确保日志目录存在
    const logDir = path.dirname(logConfig.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 配置日志
    logger.initialize(logConfig);
    
    // 记录启动信息
    logger.info('启动文件系统MCP服务器', { 
      options, 
      logConfig,
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    });
    
// 注册所有工具
registerFileTools();
registerDirectoryTools();
registerLineTools();
registerWatchTools();
registerOfficeTools();
    registerCacheTools();
    registerMonitorCallbackTools();
    
    // 创建STDIO传输层
    const transport = new StdioServerTransport();
    
    // 连接传输层
    await server.connect(transport);
    
    logger.info('MCP文件系统服务器已启动，等待命令...');
    
    // 注册进程退出处理
    process.on('SIGINT', async () => {
      logger.info('收到退出信号，正在关闭服务器...');
      try {
        // 安全关闭服务器连接
        if (server && typeof server.disconnect === 'function') {
          await server.disconnect();
        }
        // 关闭日志系统
        logger.shutdown();
      } catch (e) {
        logger.error(`关闭服务器时出错: ${e.message}`);
      }
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('收到终止信号，正在关闭服务器...');
      try {
        // 安全关闭服务器连接
        if (server && typeof server.disconnect === 'function') {
          await server.disconnect();
        }
        // 关闭日志系统
        logger.shutdown();
      } catch (e) {
        logger.error(`关闭服务器时出错: ${e.message}`);
      }
      process.exit(0);
    });
    
    // 注册未捕获的异常处理
    process.on('uncaughtException', (error) => {
      logger.error(`未捕获的异常，关闭所有监控器`, { error });
      // 尝试关闭所有监控器
      try {
        watchTools.closeAllWatchers();
      } catch (e) {
        logger.error(`关闭监控器时出错: ${e.message}`);
      }
      // 关闭日志
      logger.shutdown();
      console.error('MCP服务器已关闭');
      process.exit(1);
    });
    
    return { success: true, server };
  } catch (error) {
    logger.error(`服务器启动失败: ${error.message}`, { error, stack: error.stack });
    throw error;
  }
}

// 如果直接运行此文件则启动服务器
if (require.main === module) {
  startServer().catch(() => {
    process.exit(1);
  });
}

// 导出startServer函数
module.exports = {
  startServer
}; 