import { useSearchParams } from 'react-router-dom'

export function useLinkParam(name) {
  const [searchParams, setSearchParams] = useSearchParams()

  function clear() {
    setSearchParams(
      params => {
        params.delete(name)
        return params
      },
      { replace: true }
    )
  }

  return { value: searchParams.get(name), clear }
}
