import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';

const FREE_SCAN_LIMIT = 5;

export function useScanCount() {
  const [count, setCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCount(0); return; }
        const { count: c } = await supabase
          .from('scan_images')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        setCount(c ?? 0);
      })();
    }, [])
  );

  return {
    count,
    limit: FREE_SCAN_LIMIT,
    remaining: count !== null ? Math.max(0, FREE_SCAN_LIMIT - count) : null,
    limitReached: count !== null && count >= FREE_SCAN_LIMIT,
  };
}
