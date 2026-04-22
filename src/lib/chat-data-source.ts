import DataSource from '@/models/DataSource';

const UNSCOPED_DATA_SOURCE_FILTER = {
  $or: [{ chatId: { $exists: false } }, { chatId: null }],
};

export async function resolveChatDataSource(options: {
  userId: string;
  chatId: string;
  dataSourceId?: string | null;
}) {
  const { userId, chatId, dataSourceId } = options;

  if (dataSourceId) {
    const linkedDataSource = await DataSource.findOne({
      _id: dataSourceId,
      userId,
    });

    if (linkedDataSource) {
      return linkedDataSource;
    }
  }

  const chatScopedDataSource = await DataSource.findOne({
    userId,
    chatId,
  }).sort({ createdAt: 1 });

  if (chatScopedDataSource) {
    return chatScopedDataSource;
  }

  return DataSource.findOne({
    userId,
    ...UNSCOPED_DATA_SOURCE_FILTER,
  }).sort({ createdAt: 1 });
}

export function buildUploadCleanupFilter(userId: string, chatId?: string | null) {
  if (chatId) {
    return { userId, chatId };
  }

  return {
    userId,
    ...UNSCOPED_DATA_SOURCE_FILTER,
  };
}
