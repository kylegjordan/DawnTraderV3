import { Download, FileText, FileSpreadsheet, FileJson, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FileAttachment {
  filename: string;
  category: 'report' | 'log' | 'export' | 'analysis';
  url: string;
  size?: string;
}

interface ChatFileAttachmentProps {
  files: FileAttachment[];
}

export function ChatFileAttachment({ files }: ChatFileAttachmentProps) {
  if (!files || files.length === 0) return null;

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'md':
      case 'txt':
        return <FileText className="w-4 h-4" />;
      case 'csv':
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4" />;
      case 'json':
        return <FileJson className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'report':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
      case 'export':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'log':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
      case 'analysis':
        return 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {files.map((file, index) => (
        <Card key={index} className="p-3 bg-muted/50 dark:bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getFileIcon(file.filename)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.filename}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeClass(file.category)}`}>
                    {file.category}
                  </span>
                  {file.size && (
                    <span className="text-xs text-muted-foreground">{file.size}</span>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              asChild
              data-testid={`button-download-${file.filename}`}
            >
              <a href={file.url} download>
                <Download className="w-4 h-4 mr-1" />
                Download
              </a>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
