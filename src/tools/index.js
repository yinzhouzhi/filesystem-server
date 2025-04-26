/**
 * 工具注册表
 * 定义和注册所有可用的文件操作工具
 */
const fileTools = require('./file-tools');
const dirTools = require('./dir-tools');
const lineTools = require('./line-tools');
const watchTools = require('./watch-tools');
const officeTools = require('./office-tools');

// 工具定义
const tools = {
  // 文件操作工具
  list_files: {
    name: 'list_files',
    description: '列出目录中的文件',
    parameters: {
      properties: {
        path: { type: 'string', description: '目录路径' }
      },
      required: ['path']
    },
    implementation: dirTools.listFiles
  },
  
  read_file: {
    name: 'read_file',
    description: '读取文件内容',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' },
        encoding: { type: 'string', description: '编码方式，默认utf-8' }
      },
      required: ['path']
    },
    implementation: fileTools.readFile
  },
  
  write_file: {
    name: 'write_file',
    description: '写入文件内容',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
        encoding: { type: 'string', description: '编码方式，默认utf-8' }
      },
      required: ['path', 'content']
    },
    implementation: fileTools.writeFile
  },
  
  delete_file: {
    name: 'delete_file',
    description: '删除文件',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    implementation: fileTools.deleteFile
  },
  
  create_directory: {
    name: 'create_directory',
    description: '创建目录',
    parameters: {
      properties: {
        path: { type: 'string', description: '目录路径' },
        recursive: { type: 'boolean', description: '是否递归创建父目录' }
      },
      required: ['path']
    },
    implementation: dirTools.createDirectory
  },
  
  delete_directory: {
    name: 'delete_directory',
    description: '删除目录',
    parameters: {
      properties: {
        path: { type: 'string', description: '目录路径' },
        recursive: { type: 'boolean', description: '是否递归删除目录内容' }
      },
      required: ['path']
    },
    implementation: dirTools.deleteDirectory
  },
  
  copy_file: {
    name: 'copy_file',
    description: '复制文件',
    parameters: {
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标文件路径' }
      },
      required: ['source', 'destination']
    },
    implementation: fileTools.copyFile
  },
  
  move_file: {
    name: 'move_file',
    description: '移动文件',
    parameters: {
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标文件路径' }
      },
      required: ['source', 'destination']
    },
    implementation: fileTools.moveFile
  },
  
  file_info: {
    name: 'file_info',
    description: '获取文件信息',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    implementation: fileTools.getFileInfo
  },
  
  file_exists: {
    name: 'file_exists',
    description: '检查文件是否存在',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    implementation: fileTools.fileExists
  },
  
  watch_directory: {
    name: 'watch_directory',
    description: '监听目录变化',
    parameters: {
      properties: {
        path: { type: 'string', description: '目录路径' },
        recursive: { type: 'boolean', description: '是否递归监听子目录' }
      },
      required: ['path']
    },
    implementation: watchTools.watchPath
  },
  
  // 新增的文件监控工具
  watch_path: {
    name: 'watch_path',
    description: '监控文件或目录变更',
    parameters: {
      properties: {
        path: { type: 'string', description: '要监控的文件或目录路径' },
        recursive: { type: 'boolean', description: '是否递归监控子目录' },
        events: { type: 'string', description: '监控的事件类型，逗号分隔' }
      },
      required: ['path']
    },
    implementation: watchTools.watchPath
  },
  
  stop_watch: {
    name: 'stop_watch',
    description: '停止文件或目录监控',
    parameters: {
      properties: {
        watcherId: { type: 'string', description: '监控ID' }
      },
      required: ['watcherId']
    },
    implementation: watchTools.stopWatch
  },
  
  list_watchers: {
    name: 'list_watchers',
    description: '获取当前活跃的监控列表',
    parameters: {
      properties: {},
      required: []
    },
    implementation: watchTools.listWatchers
  },
  
  read_file_lines: {
    name: 'read_file_lines',
    description: '读取文件指定行范围',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' },
        start: { type: 'integer', description: '起始行(从1开始)' },
        end: { type: 'integer', description: '结束行' },
        encoding: { type: 'string', description: '编码方式，默认utf-8' }
      },
      required: ['path', 'start', 'end']
    },
    implementation: lineTools.readFileLines
  },
  
  append_file: {
    name: 'append_file',
    description: '追加内容到文件',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '追加的内容' },
        encoding: { type: 'string', description: '编码方式，默认utf-8' }
      },
      required: ['path', 'content']
    },
    implementation: fileTools.appendFile
  },
  
  count_lines: {
    name: 'count_lines',
    description: '统计文件行数',
    parameters: {
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    implementation: lineTools.countFileLines
  },
  
  read_word_document: {
    name: 'read_word_document',
    description: '读取Word文档内容并转换为文本',
    parameters: {
      properties: {
        path: { type: 'string', description: 'Word文件路径(.doc或.docx格式)' },
        outputFormat: { 
          type: 'string', 
          enum: ['text', 'html'],
          description: '输出格式，支持text和html，默认text'
        },
        extractImages: { 
          type: 'boolean', 
          description: '是否提取图片信息，默认false'
        },
        includeStyles: { 
          type: 'boolean', 
          description: '是否包含样式信息，默认false'
        },
        pagination: {
          type: 'object',
          properties: {
            pageSize: { type: 'integer', description: '每页字符数' },
            pageNum: { type: 'integer', description: '页码(从1开始)' }
          },
          description: '分页参数，用于大文档分页读取'
        },
        range: {
          type: 'object',
          properties: {
            startLine: { type: 'integer', description: '起始行号(从1开始)' },
            endLine: { type: 'integer', description: '结束行号' }
          },
          description: '读取范围，指定起始行和结束行'
        },
        splitByParagraphs: {
          type: 'boolean',
          description: '是否按段落拆分返回，默认false'
        }
      },
      required: ['path']
    },
    implementation: officeTools.readWordDocument
  },
  
  read_excel_file: {
    name: 'read_excel_file',
    description: '读取Excel文件内容',
    parameters: {
      properties: {
        path: { type: 'string', description: 'Excel文件路径(.xlsx、.xls或.csv格式)' },
        sheet: { 
          oneOf: [
            { type: 'string', description: '工作表名称' },
            { type: 'integer', description: '工作表索引(从0开始)' }
          ],
          description: '要读取的工作表名称或索引，默认读取第一个工作表'
        },
        outputFormat: {
          type: 'string',
          enum: ['json', 'csv', 'array'],
          description: '输出格式，支持json、csv和array，默认array'
        },
        range: {
          type: 'object',
          properties: {
            startRow: { type: 'integer', description: '起始行号(从1开始)' },
            endRow: { type: 'integer', description: '结束行号' },
            startCol: { type: 'integer', description: '起始列号(从1开始)' },
            endCol: { type: 'integer', description: '结束列号' }
          },
          description: '读取范围，例如{startRow:1, endRow:10, startCol:1, endCol:5}'
        },
        includeFormulas: {
          type: 'boolean',
          description: '是否包含公式，默认false'
        },
        headerRow: {
          type: 'boolean',
          description: '是否将第一行作为表头，默认false'
        }
      },
      required: ['path']
    },
    implementation: officeTools.readExcelFile
  }
};

/**
 * 获取所有工具定义
 * @returns {Object[]} 工具定义列表
 */
function getAllTools() {
  return Object.values(tools).map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

/**
 * 根据名称获取工具
 * @param {string} toolName 工具名称
 * @returns {Object|null} 工具定义对象
 */
function getTool(toolName) {
  return tools[toolName] || null;
}

/**
 * 执行工具调用
 * @param {string} toolName 工具名称
 * @param {Object} params 工具参数
 * @returns {Promise<any>} 执行结果
 */
async function executeTool(toolName, params) {
  const tool = getTool(toolName);
  
  if (!tool) {
    throw new Error(`未知工具: ${toolName}`);
  }
  
  // 验证必需参数
  const requiredParams = tool.parameters?.required || [];
  for (const param of requiredParams) {
    if (params[param] === undefined) {
      throw new Error(`缺少必需参数: ${param}`);
    }
  }
  
  // 执行工具实现
  return await tool.implementation(params);
}

module.exports = {
  getAllTools,
  getTool,
  executeTool
}; 