using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading.Tasks;

internal static class Program
{
    private static int Main()
    {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var indexPath = Path.Combine(root, "index.html");

        if (!File.Exists(indexPath))
        {
            Console.Error.WriteLine("index.html was not found next to OCRscanTables.exe.");
            Console.Error.WriteLine("Put OCRscanTables.exe in the project folder and run it again.");
            return 1;
        }

        try
        {
            var port = FindFreePort(5173, 5199);
            using (var listener = new HttpListener())
            {
                var prefix = string.Format("http://127.0.0.1:{0}/", port);
                listener.Prefixes.Add(prefix);
                listener.Start();

                Console.WriteLine("OCR Scan Tables is running.");
                Console.WriteLine(prefix);
                Console.WriteLine("Close this window to stop the local service.");
                OpenBrowser(prefix);

                while (listener.IsListening)
                {
                    var context = listener.GetContext();
                    Task.Run(delegate { ServeRequest(context, root); });
                }
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }

        return 0;
    }

    private static int FindFreePort(int start, int end)
    {
        for (var port = start; port <= end; port++)
        {
            try
            {
                using (var probe = new HttpListener())
                {
                    probe.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port));
                    probe.Start();
                    return port;
                }
            }
            catch (HttpListenerException)
            {
            }
        }

        throw new InvalidOperationException(string.Format("No free localhost port found from {0} to {1}.", start, end));
    }

    private static void ServeRequest(HttpListenerContext context, string root)
    {
        try
        {
            var requestPath = Uri.UnescapeDataString(context.Request.Url == null ? "/" : context.Request.Url.AbsolutePath);
            if (requestPath == "/")
            {
                requestPath = "/index.html";
            }

            requestPath = requestPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(root, requestPath));
            if (!fullPath.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
            {
                context.Response.StatusCode = 404;
                WriteText(context.Response, "Not found");
                return;
            }

            context.Response.ContentType = GetContentType(fullPath);
            using (var stream = File.OpenRead(fullPath))
            {
                context.Response.ContentLength64 = stream.Length;
                stream.CopyTo(context.Response.OutputStream);
            }
        }
        catch (Exception error)
        {
            context.Response.StatusCode = 500;
            WriteText(context.Response, error.Message);
        }
        finally
        {
            context.Response.Close();
        }
    }

    private static void WriteText(HttpListenerResponse response, string value)
    {
        response.ContentType = "text/plain; charset=utf-8";
        using (var writer = new StreamWriter(response.OutputStream))
        {
            writer.Write(value);
        }
    }

    private static string GetContentType(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html":
                return "text/html; charset=utf-8";
            case ".css":
                return "text/css; charset=utf-8";
            case ".js":
            case ".mjs":
                return "text/javascript; charset=utf-8";
            case ".json":
                return "application/json; charset=utf-8";
            case ".png":
                return "image/png";
            case ".jpg":
            case ".jpeg":
                return "image/jpeg";
            case ".webp":
                return "image/webp";
            case ".bmp":
                return "image/bmp";
            case ".wasm":
                return "application/wasm";
            default:
                return "application/octet-stream";
        }
    }

    private static void OpenBrowser(string url)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true,
        });
    }
}
