import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useCigarCount() {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    supabase
      .from('cigars')
      .select('*', { count: 'exact', head: true })
      .then(({ count: c }) => {
        if (c !== null) setCount(c);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return count;
}
