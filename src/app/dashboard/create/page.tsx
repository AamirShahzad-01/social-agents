'use client'

import { useDashboard } from '@/contexts/DashboardContext';
import ContentStrategistView from '@/components/content/ContentStrategistView';

export default function CreatePage() {
    const { addPost } = useDashboard();

    return (
        <div className="absolute inset-0 p-0">
            <ContentStrategistView onPostCreated={addPost} />
        </div>
    );
}
